"""Voyage voyage-4 embeddings (1024 dims). input_type 'document' for slides, 'query' for searches."""

from __future__ import annotations

import hashlib
import sqlite3
import struct
import time
from functools import lru_cache

import httpx

from config import CACHE, EMBED_DIMS, EMBED_MODEL, env

URL = "https://api.voyageai.com/v1/embeddings"
BATCH = 64
# Voyage counts tokens per request; keep each batch well under its per-request limit.
MAX_BATCH_CHARS = 200_000

tokens_used = 0
reused = 0  # chunks served from the local cache (identical text embedded before)

_db: sqlite3.Connection | None = None


def _cache() -> sqlite3.Connection:
    """Document vectors on disk, keyed by model + exact chunk text: re-running ingestion after a
    manifest edit, or the same chunk in two courses, never pays for the same embedding twice."""
    global _db
    if _db is None:
        CACHE.mkdir(parents=True, exist_ok=True)
        _db = sqlite3.connect(CACHE / "embeddings.sqlite")
        _db.execute("create table if not exists vec (key text primary key, v blob not null)")
    return _db


def _key(text: str) -> str:
    return hashlib.sha256(f"{EMBED_MODEL}|{EMBED_DIMS}|document|{text}".encode()).hexdigest()


def embed_documents(texts: list[str]) -> list[list[float]]:
    global reused
    db = _cache()
    keys = [_key(t) for t in texts]
    found: dict[str, list[float]] = {}
    for i in range(0, len(keys), 500):
        part = keys[i:i + 500]
        rows = db.execute(f"select key, v from vec where key in ({','.join('?' * len(part))})", part).fetchall()
        found.update({k: list(struct.unpack(f"{EMBED_DIMS}f", v)) for k, v in rows})
    todo = list(dict.fromkeys(t for t, k in zip(texts, keys) if k not in found))
    reused += sum(1 for k in keys if k in found)

    fresh: list[list[float]] = []
    batch: list[str] = []
    size = 0
    for text in todo:
        if batch and (len(batch) >= BATCH or size + len(text) > MAX_BATCH_CHARS):
            fresh.extend(_embed(batch, "document"))
            batch, size = [], 0
        batch.append(text)
        size += len(text)
    if batch:
        fresh.extend(_embed(batch, "document"))
    with db:
        for t, v in zip(todo, fresh):
            found[_key(t)] = v
            db.execute("insert or replace into vec values (?, ?)", (_key(t), struct.pack(f"{EMBED_DIMS}f", *v)))
    return [found[k] for k in keys]


@lru_cache(maxsize=512)
def _embed_query_cached(text: str) -> tuple[float, ...]:
    return tuple(_embed([text], "query")[0])


def embed_query(text: str) -> list[float]:
    return list(_embed_query_cached(text))


def _embed(texts: list[str], input_type: str) -> list[list[float]]:
    global tokens_used
    headers = {"Authorization": f"Bearer {env('VOYAGE_API_KEY')}"}
    body = {"input": texts, "model": EMBED_MODEL, "input_type": input_type, "output_dimension": EMBED_DIMS}
    for attempt in range(6):
        try:
            response = httpx.post(URL, json=body, headers=headers, timeout=120)
        except httpx.TransportError as e:  # dropped connection, timeout: retry like a 5xx
            if attempt == 5:
                raise RuntimeError(f"Voyage embeddings unreachable after retries: {e}") from e
            time.sleep(min(60, 2 ** attempt * 2))
            continue
        if response.status_code == 429 or response.status_code >= 500:
            time.sleep(min(60, 2 ** attempt * 2))
            continue
        response.raise_for_status()
        data = response.json()
        tokens_used += data.get("usage", {}).get("total_tokens", 0)
        vectors = [d["embedding"] for d in sorted(data["data"], key=lambda d: d["index"])]
        if len(vectors) != len(texts) or any(len(v) != EMBED_DIMS for v in vectors):
            raise RuntimeError(f"Voyage returned {len(vectors)} vectors for {len(texts)} inputs, or wrong dimensions")
        return vectors
    raise RuntimeError(f"Voyage embeddings failed after retries: {response.status_code} {response.text[:200]}")
