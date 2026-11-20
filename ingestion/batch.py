"""Anthropic Message Batches (50% off) with an on-disk cache, for the past-papers pipeline (PRD §9.4).

- Every request is keyed by a hash of its full params. A reply already in data/.cache/batches/ is
  reused, so a re-run only pays for requests that changed.
- A submitted batch's id is saved before polling, so a crash or Ctrl-C resumes the same batch on
  the next run instead of paying twice.
- Costs are computed from each reply's usage at batch prices.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from config import CACHE

CACHE_DIR = CACHE / "batches"
PENDING = CACHE_DIR / "pending.json"

# Standard prices, $ per million tokens (input, output), prompts ≤ 100K tokens. Batches are half.
# Check https://www.anthropic.com/pricing before a large run.
PRICES = {
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}
BATCH_DISCOUNT = 0.5


SPEND_LOG = CACHE.parent / ".reports" / "past-spend.jsonl"


def log_spend(label: str, by_model: dict[str, float]) -> None:
    """Append what a run really spent (new requests only; cached replies are free) to
    data/.reports/past-spend.jsonl, one line per run, so every phase's real cost can be added up."""
    from datetime import datetime

    SPEND_LOG.parent.mkdir(parents=True, exist_ok=True)
    with SPEND_LOG.open("a") as f:
        f.write(json.dumps({"at": datetime.now().isoformat(timespec="seconds"), "run": label,
                            "usd": {m: round(v, 4) for m, v in by_model.items()}, "total": round(sum(by_model.values()), 4)}) + "\n")


def price(model: str) -> tuple[float, float]:
    if model not in PRICES:
        raise SystemExit(f"No price for {model}. Add it to PRICES in ingestion/batch.py.")
    return PRICES[model]


def batch_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pin, pout = price(model)
    return BATCH_DISCOUNT * (input_tokens * pin + output_tokens * pout) / 1e6


@dataclass
class Reply:
    custom_id: str
    text: str | None  # the final text block (JSON for structured output)
    stop_reason: str | None
    input_tokens: int
    output_tokens: int
    cached: bool
    error: str | None = None


_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(max_retries=6, timeout=300.0)
    return _client


def request_key(params: dict) -> str:
    return hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()


def cached(params: dict) -> Reply | None:
    path = CACHE_DIR / f"{request_key(params)}.json"
    if not path.is_file():
        return None
    d = json.loads(path.read_text())
    return Reply(custom_id="", text=d["text"], stop_reason=d["stop_reason"], input_tokens=d["input_tokens"],
                 output_tokens=d["output_tokens"], cached=True)


def count_input_tokens(params: dict) -> int:
    """Exact input tokens for one request (the count_tokens endpoint is free)."""
    keep = {k: params[k] for k in ("model", "messages", "system", "tools") if k in params}
    return client().messages.count_tokens(**keep).input_tokens


MAX_BATCH_BYTES = 120_000_000  # the Batches API takes up to 256 MB per batch; past papers carry page images
MAX_BATCH_REQUESTS = 10_000


def _chunks(todo: dict[str, dict]) -> list[dict[str, dict]]:
    """Split requests into batches under MAX_BATCH_BYTES / MAX_BATCH_REQUESTS (in custom_id order)."""
    out: list[dict[str, dict]] = [{}]
    size = 0
    for cid in sorted(todo):
        n = len(json.dumps(todo[cid]))
        if out[-1] and (size + n > MAX_BATCH_BYTES or len(out[-1]) >= MAX_BATCH_REQUESTS):
            out.append({})
            size = 0
        out[-1][cid] = todo[cid]
        size += n
    return out


def _collect(batch_id: str, chunk: dict[str, dict], out: dict[str, Reply]) -> None:
    for result in client().messages.batches.results(batch_id):
        cid = result.custom_id
        params = chunk.get(cid)
        if params is None:
            continue
        r = result.result
        if r.type == "succeeded":
            msg = r.message
            text = next((blk.text for blk in reversed(msg.content) if blk.type == "text"), None)
            reply = Reply(cid, text, msg.stop_reason, msg.usage.input_tokens, msg.usage.output_tokens, cached=False)
            if msg.stop_reason == "end_turn" and text is not None:
                (CACHE_DIR / f"{request_key(params)}.json").write_text(json.dumps({
                    "text": text, "stop_reason": msg.stop_reason,
                    "input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens,
                }))
            else:
                reply.error = f"stopped: {msg.stop_reason}"
            out[cid] = reply
        else:
            out[cid] = Reply(cid, None, None, 0, 0, cached=False, error=f"{r.type}: {str(getattr(r, 'error', ''))[:300]}")


def run(requests: dict[str, dict], label: str, poll_seconds: int = 20) -> dict[str, Reply]:
    """requests: {custom_id: Messages params}. Returns {custom_id: Reply}; cached replies are free.
    Large runs go as several batches (MAX_BATCH_BYTES each). Submitted batches are remembered in
    data/.cache/batches/pending.json, so a run stopped midway resumes them instead of paying again."""
    out: dict[str, Reply] = {}
    todo: dict[str, dict] = {}
    for cid, params in requests.items():
        hit = cached(params)
        if hit:
            hit.custom_id = cid
            out[cid] = hit
        else:
            todo[cid] = params
    if not todo:
        return out

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    pending = json.loads(PENDING.read_text()) if PENDING.is_file() else {}
    key_of = {cid: request_key(p) for cid, p in todo.items()}
    by_key = {k: cid for cid, k in key_of.items()}
    running: list[tuple[str, str, dict[str, dict]]] = []  # (set_key, batch_id, chunk)

    # Resume batches submitted earlier whose requests are all still wanted.
    for set_key, entry in list(pending.items()):
        if not isinstance(entry, dict):
            continue
        keys = entry.get("keys") or []
        if keys and all(k in by_key for k in keys):
            chunk = {by_key[k]: todo[by_key[k]] for k in keys}
            for cid in chunk:
                todo.pop(cid)
            running.append((set_key, entry["id"], chunk))
            print(f"  resuming batch {entry['id']}: {len(chunk)} request(s) ({label})")

    if todo:
        parts = _chunks(todo)
        for i, chunk in enumerate(parts, 1):
            keys = sorted(key_of[cid] for cid in chunk)
            set_key = hashlib.sha256("".join(keys).encode()).hexdigest()
            batch = client().messages.batches.create(requests=[
                Request(custom_id=cid, params=MessageCreateParamsNonStreaming(**params)) for cid, params in chunk.items()
            ])
            pending[set_key] = {"id": batch.id, "keys": keys}
            PENDING.write_text(json.dumps(pending, indent=1))
            running.append((set_key, batch.id, chunk))
            print(f"  submitted batch {batch.id} ({i}/{len(parts)}): {len(chunk)} request(s) ({label})", flush=True)

    started = time.monotonic()
    left = list(running)
    while left:
        still = []
        totals = [0, 0, 0]
        for set_key, batch_id, chunk in left:
            b = client().messages.batches.retrieve(batch_id)
            if b.processing_status == "ended":
                _collect(batch_id, chunk, out)
                pending.pop(set_key, None)
                PENDING.write_text(json.dumps(pending, indent=1))
                continue
            c = b.request_counts
            totals = [totals[0] + c.processing, totals[1] + c.succeeded, totals[2] + c.errored]
            still.append((set_key, batch_id, chunk))
        left = still
        if left:
            print(f"  … {int(time.monotonic() - started)}s: {len(left)} batch(es) running, {totals[0]} processing, "
                  f"{totals[1]} done, {totals[2]} errored", flush=True)
            time.sleep(poll_seconds)
    return out
