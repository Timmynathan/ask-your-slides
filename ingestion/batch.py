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


def run(requests: dict[str, dict], label: str, poll_seconds: int = 20) -> dict[str, Reply]:
    """requests: {custom_id: Messages params}. Returns {custom_id: Reply}; cached replies are free."""
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
    set_key = hashlib.sha256("".join(sorted(request_key(p) for p in todo.values())).encode()).hexdigest()
    pending = json.loads(PENDING.read_text()) if PENDING.is_file() else {}
    batch_id = pending.get(set_key)
    if batch_id:
        print(f"  resuming batch {batch_id} ({label})")
    else:
        batch = client().messages.batches.create(requests=[
            Request(custom_id=cid, params=MessageCreateParamsNonStreaming(**params)) for cid, params in todo.items()
        ])
        batch_id = batch.id
        pending[set_key] = batch_id
        PENDING.write_text(json.dumps(pending, indent=1))
        print(f"  submitted batch {batch_id}: {len(todo)} request(s) ({label})")

    started = time.monotonic()
    while True:
        b = client().messages.batches.retrieve(batch_id)
        if b.processing_status == "ended":
            break
        c = b.request_counts
        print(f"  … {int(time.monotonic() - started)}s: {c.processing} processing, {c.succeeded} done, {c.errored} errored", flush=True)
        time.sleep(poll_seconds)

    by_id = {cid: params for cid, params in todo.items()}
    for result in client().messages.batches.results(batch_id):
        cid = result.custom_id
        params = by_id.get(cid)
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

    pending.pop(set_key, None)
    PENDING.write_text(json.dumps(pending, indent=1))
    return out
