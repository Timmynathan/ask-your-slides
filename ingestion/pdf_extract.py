"""PDF side of extraction: convert PPTX/PPT to PDF, render pages, extract text and visual signals."""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

import filetype
from config import CACHE, RENDER_WIDTH

SOFFICE = shutil.which("soffice") or "/Applications/LibreOffice.app/Contents/MacOS/soffice"

# Images smaller than this share of the page are icons/bullets, not content.
MIN_IMAGE_AREA = 0.03
# An image on at least this share of a material's pages is a template element (logo, banner).
REPEATED_IMAGE_SHARE = 0.5
# Many vector paths on a page usually means a drawn diagram or a ruled table.
DIAGRAM_DRAWINGS = 25


@dataclass
class PdfPage:
    number: int  # 1-based
    title: str | None
    text: str
    image_keys: list[str] = field(default_factory=list)  # content images (size-filtered)
    drawings: int = 0
    png: bytes | None = None


def to_pdf(src: Path) -> Path:
    """PPTX/PPT → PDF with LibreOffice headless (one page per visible slide). Cached by file hash."""
    if filetype.detect(src) == "pdf":
        return src  # by content: a PDF named .pptx is still a PDF
    digest = hashlib.sha256(src.read_bytes()).hexdigest()[:24]
    out_dir = CACHE / "pdf" / digest
    out = out_dir / (src.stem + ".pdf")
    if out.is_file():
        return out
    out_dir.mkdir(parents=True, exist_ok=True)
    # Own profile dir: a LibreOffice window open on the Mac would otherwise lock the default one.
    profile = (CACHE / "lo-profile").resolve().as_uri()
    result = subprocess.run(
        [SOFFICE, f"-env:UserInstallation={profile}", "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(src)],
        capture_output=True,
        text=True,
        timeout=600,
    )
    if result.returncode != 0 or not out.is_file():
        raise RuntimeError(f"LibreOffice could not convert {src.name}: {result.stderr.strip() or result.stdout.strip()}")
    return out


def read_pdf(pdf_path: Path, render: bool = True) -> list[PdfPage]:
    pages: list[PdfPage] = []
    with pymupdf.open(pdf_path) as doc:
        for page in doc:
            page_area = abs(page.rect.width * page.rect.height) or 1.0
            image_keys = []
            for info in page.get_image_info(hashes=True):
                x0, y0, x1, y1 = info["bbox"]
                if abs((x1 - x0) * (y1 - y0)) / page_area >= MIN_IMAGE_AREA:
                    image_keys.append(info.get("digest", b"").hex() or f"p{page.number}-{len(image_keys)}")
            png = None
            if render:
                zoom = RENDER_WIDTH / page.rect.width
                png = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).tobytes("png")
            pages.append(
                PdfPage(
                    number=page.number + 1,
                    title=_title(page),
                    text=clean_text(page.get_text("text")),
                    image_keys=image_keys,
                    drawings=len(page.get_drawings()),
                    png=png,
                )
            )
    return pages


TESSDATA = os.environ.get("TESSDATA_PREFIX") or next(
    (p for p in ("/opt/homebrew/share/tessdata", "/usr/local/share/tessdata", "/usr/share/tesseract-ocr/5/tessdata") if Path(p).is_dir()),
    None,
)


def ocr_page(pdf_path: Path, number: int) -> str:
    """Verbatim text of one page via Tesseract OCR (for scanned pages or broken text layers)."""
    if TESSDATA is None:
        raise RuntimeError("Tesseract language data not found: brew install tesseract (or set TESSDATA_PREFIX)")
    with pymupdf.open(pdf_path) as doc:
        page = doc[number - 1]
        textpage = page.get_textpage_ocr(language="eng", dpi=300, full=True, tessdata=TESSDATA)
        return clean_text(page.get_text("text", textpage=textpage))


def repeated_images(pages: list[PdfPage]) -> set[str]:
    """Images that appear on most pages of a material: logos and template art."""
    if len(pages) < 4:
        return set()
    counts = Counter(k for p in pages for k in set(p.image_keys))
    return {k for k, n in counts.items() if n / len(pages) >= REPEATED_IMAGE_SHARE}


def visual_reason(page: PdfPage, template_images: set[str]) -> str | None:
    if any(k not in template_images for k in page.image_keys):
        return "image"
    if page.drawings >= DIAGRAM_DRAWINGS:
        return "diagram or table"
    return None


def clean_text(text: str) -> str:
    lines = [" ".join(line.split()) for line in text.splitlines()]
    out: list[str] = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    return "\n".join(out).strip()


def _title(page: pymupdf.Page) -> str | None:
    """The largest-font line in the top 40% of the page, if it is clearly bigger than body text."""
    best: tuple[float, str] | None = None
    sizes: list[float] = []
    cutoff = page.rect.y0 + page.rect.height * 0.4
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            size = max(s["size"] for s in spans)
            text = " ".join(" ".join(s["text"] for s in spans).split())
            sizes.extend(s["size"] for s in spans)
            if line["bbox"][1] <= cutoff and 3 <= len(text) <= 150 and (best is None or size > best[0]):
                best = (size, text)
    if best is None or not sizes:
        return None
    sizes.sort()
    median = sizes[len(sizes) // 2]
    return best[1] if best[0] >= median * 1.15 or len(set(sizes)) == 1 else None
