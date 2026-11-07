"""Voyage voyage-4 embeddings (1024 dims). input_type 'document' for slides, 'query' for searches."""

from __future__ import annotations

import time

import httpx

from config import EMBED_DIMS, EMBED_MODEL, env

URL = "https://api.voyageai.com/v1/embeddings"
BATCH = 64
# Voyage counts tokens per request; keep each batch well under its per-request limit.
MAX_BATCH_CHARS = 200_000

tokens_used = 0


def embed_documents(texts: list[str]) -> list[list[float]]:
    out: list[list[float]] = []
    batch: list[str] = []
    size = 0
    for text in texts:
        if batch and (len(batch) >= BATCH or size + len(text) > MAX_BATCH_CHARS):
            out.extend(_embed(batch, "document"))
            batch, size = [], 0
        batch.append(text)
        size += len(text)
    if batch:
        out.extend(_embed(batch, "document"))
    return out


def embed_query(text: str) -> list[float]:
    return _embed([text], "query")[0]


def _embed(texts: list[str], input_type: str) -> list[list[float]]:
    global tokens_used
    headers = {"Authorization": f"Bearer {env('VOYAGE_API_KEY')}"}
    body = {"input": texts, "model": EMBED_MODEL, "input_type": input_type, "output_dimension": EMBED_DIMS}
    for attempt in range(6):
        response = httpx.post(URL, json=body, headers=headers, timeout=120)
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
