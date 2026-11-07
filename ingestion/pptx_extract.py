"""PPTX side of extraction: titles, body text, tables and speaker notes per visible slide.

python-pptx reads the real text structure (better than PDF text for slides) and the speaker notes
(which the PDF does not have). Rendering still comes from the LibreOffice PDF.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from pdf_extract import REPEATED_IMAGE_SHARE, clean_text


@dataclass
class PptxSlide:
    title: str | None
    body: str
    notes: str | None
    image_keys: list[str] = field(default_factory=list)
    has_chart: bool = False
    has_math: bool = False
    has_object: bool = False  # embedded OLE object (e.g. a Visio diagram)


def extract(path: Path) -> list[PptxSlide]:
    prs = Presentation(str(path))
    slides: list[PptxSlide] = []
    for slide in prs.slides:
        if slide._element.get("show") == "0":  # hidden; LibreOffice does not export it either
            continue
        title_shape = slide.shapes.title
        title = clean_text(title_shape.text_frame.text) if title_shape is not None and title_shape.has_text_frame else None
        parts: list[str] = []
        s = PptxSlide(title=title or None, body="", notes=None)
        for shape in _walk(slide.shapes):
            if title_shape is not None and shape.shape_id == title_shape.shape_id:
                continue
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE or getattr(shape, "image", None) is not None:
                try:
                    s.image_keys.append(shape.image.sha1)
                except (AttributeError, ValueError, KeyError):
                    pass
            if getattr(shape, "has_chart", False) and shape.has_chart:
                s.has_chart = True
            if shape.shape_type in (MSO_SHAPE_TYPE.EMBEDDED_OLE_OBJECT, MSO_SHAPE_TYPE.LINKED_OLE_OBJECT):
                s.has_object = True
            if getattr(shape, "has_table", False) and shape.has_table:
                rows = [" | ".join(clean_text(c.text) for c in row.cells) for row in shape.table.rows]
                parts.append("\n".join(rows))
            elif shape.has_text_frame and shape.text_frame.text.strip():
                parts.append(clean_text(shape.text_frame.text))
        s.body = "\n".join(p for p in parts if p).strip()
        s.has_math = b"oMath" in etree.tostring(slide._element)
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
            s.notes = clean_text(slide.notes_slide.notes_text_frame.text) or None
        slides.append(s)
    return slides


def repeated_images(slides: list[PptxSlide]) -> set[str]:
    if len(slides) < 4:
        return set()
    counts = Counter(k for s in slides for k in set(s.image_keys))
    return {k for k, n in counts.items() if n / len(slides) >= REPEATED_IMAGE_SHARE}


def visual_reason(slide: PptxSlide, template_images: set[str]) -> str | None:
    # Tables are not a reason here: python-pptx already gives their exact text.
    if slide.has_chart:
        return "chart"
    if slide.has_math:
        return "equation"
    if slide.has_object:
        return "embedded object"
    if any(k not in template_images for k in slide.image_keys):
        return "image"
    return None


def _walk(shapes):
    for shape in shapes:
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _walk(shape.shapes)
        else:
            yield shape
