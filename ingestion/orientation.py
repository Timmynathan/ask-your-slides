"""Upright pages before OCR (PRD §9.4): many past papers are phone photos, some sideways or upside down.

Tesseract's orientation detection (`--psm 0`, local, free) suggests how far a page image must turn
clockwise to be upright. On phone photos with handwriting in the margins that guess is often wrong
(an upright page called "180°" with high confidence), so a suggestion is only applied when it
proves itself: Tesseract reads clearly more confident words with the page turned than as it is.
Otherwise the page is left as it is (the model still reads it, and the report says so).
"""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image

MIN_WORDS = 15  # a turned page must read at least this many confident words…
MIN_GAIN = 1.5  # …and this many times as many as the page as it is
POOR = 15  # a page reading fewer clear words than this as it is gets every quarter turn tried
_ROTATE = re.compile(r"Rotate:\s*(\d+)")


@dataclass(frozen=True)
class Orientation:
    rotate: int  # degrees clockwise suggested by Tesseract: 0, 90, 180, 270
    applied: bool  # True when we turned the page
    words_as_is: int = 0
    words_turned: int = 0

    def describe(self) -> str:
        if self.applied:
            return f"turned {self.rotate}° ({self.words_turned} vs {self.words_as_is} clear words)"
        if self.rotate:
            return f"{self.rotate}° suggested, left as is ({self.words_turned} vs {self.words_as_is} clear words)"
        return "upright"


def available() -> bool:
    return shutil.which("tesseract") is not None


def _tesseract(image: bytes, *args: str) -> str:
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "page.png"
        path.write_bytes(image)
        try:
            out = subprocess.run(["tesseract", str(path), "-", *args], capture_output=True, text=True, timeout=120)
        except (OSError, subprocess.TimeoutExpired):
            return ""
    return out.stdout + out.stderr


def suggest(image: bytes) -> int:
    """Degrees clockwise Tesseract thinks the page must turn (0 if it can't tell)."""
    m = _ROTATE.search(_tesseract(image, "--psm", "0"))
    return int(m.group(1)) % 360 if m else 0


def clear_words(image: bytes) -> int:
    """Words of 3+ letters Tesseract reads with confidence ≥ 80: how readable the page is this way up."""
    n = 0
    for line in _tesseract(image, "--psm", "6", "tsv").splitlines()[1:]:
        cols = line.split("\t")
        if len(cols) == 12 and cols[11].strip().isalpha() and len(cols[11].strip()) >= 3:
            try:
                n += float(cols[10]) >= 80
            except ValueError:
                pass
    return n


def turn(image: bytes, degrees: int) -> bytes:
    """The image turned `degrees` clockwise (PNG)."""
    out = BytesIO()
    Image.open(BytesIO(image)).rotate(-degrees, expand=True).save(out, "PNG")
    return out.getvalue()


def check(image: bytes) -> Orientation:
    """Should this page image be turned? Only when a turn makes it clearly more readable.

    Tried: Tesseract's suggestion; and, when the page reads poorly as it is (it may be sideways
    with no suggestion), every quarter turn.
    """
    suggested = suggest(image)
    as_is = clear_words(image)
    candidates = {suggested} if suggested in (90, 180, 270) else set()
    if as_is < POOR:
        candidates |= {90, 180, 270}
    if not candidates:
        return Orientation(0, False, as_is)
    best, turned = max(((r, clear_words(turn(image, r))) for r in sorted(candidates)), key=lambda x: x[1])
    ok = turned >= MIN_WORDS and turned >= MIN_GAIN * max(as_is, 1)
    return Orientation(best if ok else (suggested or best), ok, as_is, turned)
