"""Claude Haiku 5.5 on rendered slide images.

Describes diagrams, charts, images, equations and tables that the extracted text misses
(PRD §9.2 step 4). Pages whose text layer is missing or garbled are transcribed by local OCR
instead (pdf_extract.ocr_page), not here.

Results are cached on disk by (model, prompt, image), so re-runs and crashes never pay twice.
"""

from __future__ import annotations

import base64
import hashlib
import json
import threading
from dataclasses import dataclass
from pathlib import Path

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

# Calculation courses (course.yaml calculation_heavy): formulas and worked solutions are often
# equation objects or pictures with no text layer, so the page image is the only source. Transcribed
# exactly, not summarised: a wrong symbol here would be cited in every answer on the topic.
MATH_PROMPT_VERSION = "math2"
MATH_DESCRIBE = """This image is {where}. It is from a calculation course (finance, accounting, economics or engineering); students revise worked calculations from it.

Text already extracted from it:
<extracted_text>
{text}
</extracted_text>

Transcribe exactly everything the extracted text misses:
- Every formula in LaTeX between $$ and $$, with the slide's own symbols (subscripts, Greek letters, fractions, summations). If the slide defines the symbols, list the definitions.
- Every worked solution: each line of working in order, with every number exactly as shown. Never skip, merge or summarise a step, and never correct the slide's arithmetic.
- Tables as Markdown tables, every cell.
- Charts and diagrams: what they show, with axis labels and the values shown.
If a symbol or number is unreadable, write [unclear] instead of guessing. If text runs off the edge of the slide, transcribe only what is visible and write [cut off]; never complete it.
Don't repeat what the extracted text already says, except where a formula or table needs it for context. If a title or heading appears only in the image, start with it.
If there is nothing beyond the extracted text (only a logo, a decorative picture or a background), reply with exactly NONE.
No preamble."""


@dataclass
class VisionResult:
    text: str | None
    cached: bool
    input_tokens: int = 0
    output_tokens: int = 0
    refused: bool = False
    note: str = ""


_client: anthropic.Anthropic | None = None
_lock = threading.Lock()


def _get_client() -> anthropic.Anthropic:
    global _client
    with _lock:
        if _client is None:
            # SDK retries 408/409/429/5xx and connection errors with backoff.
            _client = anthropic.Anthropic(max_retries=6, timeout=120.0)
        return _client


def _prompt(where: str, extracted_text: str, math: bool = False) -> str:
    return (MATH_DESCRIBE if math else DESCRIBE).format(where=where, text=extracted_text.strip()[:4000] or "(none)")


def _version(math: bool) -> str:
    return MATH_PROMPT_VERSION if math else PROMPT_VERSION


def _prompt_path(png: bytes, prompt: str, model: str = VISION_MODEL, math: bool = False) -> Path:
    key = hashlib.sha256(f"{model}|{_version(math)}|{prompt}".encode() + png).hexdigest()
    return CACHE / "vision" / f"{key}.json"


def _content_path(png: bytes, extracted_text: str, model: str = VISION_MODEL, math: bool = False) -> Path:
    """Keyed by what is on the page only (image + its text), not by which course it is in: the same
    file in another course or programme (IOH-ETHICS in Accounting and Film, CS files reused by
    Software Engineering) reuses the description instead of paying for it again."""
    key = hashlib.sha256(f"{model}|{_version(math)}|{extracted_text.strip()[:4000]}".encode() + png).hexdigest()
    return CACHE / "vision-content" / f"{key}.json"


def cached_path(png: bytes, where: str, extracted_text: str, twins: list[str] = (), math: bool = False,
                model: str = VISION_MODEL) -> Path | None:
    """The cache file that already describes this page, if any. `twins` are the `where` texts of the
    same file elsewhere in the catalog (descriptions cached before content keys existed)."""
    for path in (_content_path(png, extracted_text, model, math), _prompt_path(png, _prompt(where, extracted_text, math), model, math),
                 *(_prompt_path(png, _prompt(w, extracted_text, math), model, math) for w in twins)):
        if path.is_file():
            return path
    return None


def describe(png: bytes, where: str, extracted_text: str, twins: list[str] = (), math: bool = False,
             model: str | None = None) -> VisionResult:
    """math=True: the calculation-course prompt (exact LaTeX and working), longer output, and
    `model` (MATH_VISION_MODEL) may be a stronger model than the default."""
    model = model or VISION_MODEL
    hit = cached_path(png, where, extracted_text, twins, math, model)
    if hit:
        data = json.loads(hit.read_text())
        _save(_content_path(png, extracted_text, model, math), data)
        result = VisionResult(text=data["text"], cached=True, refused=data.get("refused", False), note=data.get("note", ""))
    else:
        result = _call(png, _prompt(where, extracted_text, math), max_tokens=1500 if math else 600, model=model, math=math)
        _save(_content_path(png, extracted_text, model, math), {"text": result.text, "refused": result.refused, "note": result.note})
    if result.text and result.text.strip().upper().rstrip(".") == "NONE":
        result.text = None
    return result


def _save(path: Path, data: dict) -> None:
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))


def _call(png: bytes, prompt: str, max_tokens: int, model: str = VISION_MODEL, math: bool = False) -> VisionResult:
    path = _prompt_path(png, prompt, model, math)
    if path.is_file():
        data = json.loads(path.read_text())
        return VisionResult(text=data["text"], cached=True, refused=data.get("refused", False), note=data.get("note", ""))

    try:
        response = _get_client().messages.create(
            model=model,
            max_tokens=max_tokens,
            # A description is a perception task; thinking adds cost and latency, not accuracy.
            # Sonnet 5.5 turns thinking off with "between_tools" (it rejects "disabled").
            thinking={"type": "disabled"} if "haiku" in model else {"type": "between_tools"},
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
    except anthropic.BadRequestError as e:
        # "Output blocked by content filtering policy": skip this page's description (its
        # extracted text is still used) and remember the decision so re-runs don't retry it.
        # Any other 400 is a real bug (bad parameter, bad image) and must stop the run.
        if "content filtering" not in str(e).lower():
            raise
        note = str(e)[:200]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"text": None, "refused": True, "note": note}))
        return VisionResult(text=None, cached=False, refused=True, note=note)
    refused = response.stop_reason == "refusal"
    note = "stop_reason refusal" if refused else ""
    text = None if refused else "".join(b.text for b in response.content if b.type == "text").strip() or None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"text": text, "refused": refused, "stop_reason": response.stop_reason}))
    return VisionResult(
        text=text,
        cached=False,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        refused=refused,
        note=note,
    )
