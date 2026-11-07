"""Claude Haiku 5.5 on rendered slide images.

Two jobs:
  describe    — diagrams, charts, images, equations, tables the extracted text misses (PRD §9.2 step 4)
  transcribe  — the full text of a page whose text layer is missing (scanned) or garbled
                (broken font encodings, e.g. '!' printed in place of every space)

Results are cached on disk by (model, prompt, image), so re-runs and crashes never pay twice.
"""

from __future__ import annotations

import base64
import hashlib
import json
import threading
from dataclasses import dataclass

import anthropic

from config import CACHE, VISION_MODEL

PROMPT_VERSION = "1"

DESCRIBE = """This image is {where}.

Text already extracted from it:
<extracted_text>
{text}
</extracted_text>

Describe only what that text does not already capture: diagrams, charts, figures, photos, handwriting, and any equations or tables (transcribe these exactly; write equations in plain text or LaTeX). If a title or heading appears only in the image, start with it.
If there is nothing meaningful beyond the extracted text (only a logo, a decorative picture or a background), reply with exactly NONE.
Under 150 words. Plain sentences, no preamble."""

TRANSCRIBE = """This image is {where}. Its text layer is missing or unreadable.

Transcribe all of the readable text on the page, in reading order, as plain text. Keep headings on their own lines. Skip running headers, footers and page numbers. Describe any figure in one short sentence in [brackets].
Output only the transcription."""


@dataclass
class VisionResult:
    text: str | None
    cached: bool
    input_tokens: int = 0
    output_tokens: int = 0
    refused: bool = False


_client: anthropic.Anthropic | None = None
_lock = threading.Lock()


def _get_client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            # SDK retries 408/409/429/5xx and connection errors with backoff.
            _client = anthropic.Anthropic(max_retries=6, timeout=120.0)
        return _client


def describe(png: bytes, where: str, extracted_text: str) -> VisionResult:
    prompt = DESCRIBE.format(where=where, text=extracted_text.strip()[:4000] or "(none)")
    result = _call(png, prompt, max_tokens=600)
    if result.text and result.text.strip().upper().rstrip(".") == "NONE":
        result.text = None
    return result


def transcribe(png: bytes, where: str) -> VisionResult:
    return _call(png, TRANSCRIBE.format(where=where), max_tokens=4000)


def _call(png: bytes, prompt: str, max_tokens: int) -> VisionResult:
    key = hashlib.sha256(f"{VISION_MODEL}|{PROMPT_VERSION}|{prompt}".encode() + png).hexdigest()
    path = CACHE / "vision" / f"{key}.json"
    if path.is_file():
        data = json.loads(path.read_text())
        return VisionResult(text=data["text"], cached=True, refused=data.get("refused", False))

    response = _get_client().messages.create(
        model=VISION_MODEL,
        max_tokens=max_tokens,
        # A description is a perception task; thinking adds cost and latency, not accuracy.
        thinking={"type": "disabled"},
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.standard_b64encode(png).decode()}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    refused = response.stop_reason == "refusal"
    text = None if refused else "".join(b.text for b in response.content if b.type == "text").strip() or None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"text": text, "refused": refused, "stop_reason": response.stop_reason}))
    return VisionResult(
        text=text,
        cached=False,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        refused=refused,
    )
