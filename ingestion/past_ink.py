"""Where the printed paper is on each page photo, and where a student's details are (PRD F10, owner
14 Nov 2026: show the original PAU papers, cleaned, with nothing a student wrote on them).

The vision model marks the PRINTED content as blocks (header, logo, question text, tables, figures),
which it can outline far more reliably than scattered handwriting, plus anything that identifies a
student (name, matric number, signature) and whether the page is an answer key. paper_clean.py then
keeps only print inside the blocks and whites out everything else. Replies are cached
(batch.py), so re-running costs nothing.
"""

from __future__ import annotations

import base64
import hashlib

import cv2

import batch
from config import PAST_Q_MODEL
from paper_clean import decode, straighten

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["blocks", "personal", "answer_page"],
    "properties": {
        "blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["kind", "box"],
                "properties": {
                    "kind": {"type": "string", "enum": ["header", "logo", "text", "table", "figure", "equation", "footer"]},
                    "box": {"type": "array", "items": {"type": "integer"}},
                },
            },
        },
        "personal": {"type": "array", "items": {"type": "array", "items": {"type": "integer"}}},
        "answer_page": {"type": "boolean"},
    },
}

PROMPT = """This is a photo or scan of one page of a printed university exam paper. A student may have written on it.

The image is {w}×{h} pixels. Give boxes as [x0, y0, x1, y1] in those pixels.

1. blocks: every area of PRINTED content, as tight boxes: the header lines, the logo together with its printed name beside it, each paragraph or question of printed text (one box per paragraph or question part is fine), printed tables, printed figures/diagrams, printed equations, printed page footers. Cover every printed word, including question numbers and marks. Do not include handwriting: if handwriting sits in the margin next to a paragraph, the box stops at the printed text.
2. personal: boxes around anything that identifies a person who wrote on the paper: a handwritten name, matric or student number, ID number, signature, phone number or email. Make these boxes generous. Empty if there is none.
3. answer_page: true only if this page is mainly printed answers, a marking guide or model solutions rather than questions."""


def page_image(jpeg: bytes) -> tuple[bytes, int, int]:
    """The straightened page as the model sees it (JPEG), with its size."""
    img = straighten(decode(jpeg))
    h, w = img.shape[:2]
    scale = min(1.0, 1568 / max(h, w))
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return buf.tobytes(), img.shape[1], img.shape[0]


def build_params(jpeg: bytes) -> tuple[dict, tuple[int, int]]:
    """(request, (w, h) of the image sent): boxes come back in those pixels."""
    img, w, h = page_image(jpeg)
    return {
        "model": PAST_Q_MODEL,
        "max_tokens": 4000,
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(img).decode()}},
            {"type": "text", "text": PROMPT.format(w=w, h=h)},
        ]}],
    }, (w, h)


def key(jpeg: bytes) -> str:
    return hashlib.sha256(jpeg).hexdigest()[:24]


def analyse_now(jpeg: bytes) -> dict:
    """One page, straight away (pilots and single pages; full runs go through the Batch API at half
    price). Cached like batch replies. Returns {blocks, personal, answer_page} with boxes as fractions."""
    import json

    params, (w, h) = build_params(jpeg)
    hit = batch.cached(params)
    if hit:
        text = hit.text
    else:
        msg = batch.client().messages.create(**params)
        text = next(b.text for b in msg.content if b.type == "text")
        batch.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (batch.CACHE_DIR / f"{batch.request_key(params)}.json").write_text(json.dumps({
            "text": text, "stop_reason": msg.stop_reason, "input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens,
        }))
        print(f"  page: {msg.usage.input_tokens} in, {msg.usage.output_tokens} out")
    return to_fractions(json.loads(text), w, h)


def to_fractions(d: dict, w: int, h: int) -> dict:
    f = lambda b: [b[0] / w, b[1] / h, b[2] / w, b[3] / h] if len(b) == 4 else None
    return {
        "blocks": [{"kind": b["kind"], "box": f(b["box"])} for b in d["blocks"] if f(b["box"])],
        "personal": [f(b) for b in d["personal"] if f(b)],
        "answer_page": d["answer_page"],
    }
