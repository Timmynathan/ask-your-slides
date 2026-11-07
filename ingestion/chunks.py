"""One chunk per slide/page (PRD §9.2 step 5). The header gives the embedding and the model context."""

from __future__ import annotations

MAX_CHUNK_CHARS = 12_000


def slide_key(course_code: str, material_order: int, number: int) -> str:
    return f"{course_code}-{material_order:02d}-{number}"


def image_path(course_code: str, material_order: int, number: int) -> str:
    return f"{course_code}/{material_order:02d}/{number}.png"


def unit(kind: str, is_pptx: bool) -> str:
    return "slide" if is_pptx or kind == "slides" else "page"


def build_chunk(
    *,
    course_code: str,
    course_title: str,
    topic: str | None,
    kind: str,
    material_title: str,
    unit_name: str,
    number: int,
    total: int,
    title: str | None,
    body: str | None,
    visual: str | None,
    notes: str | None,
) -> str:
    lines = [
        f"Course: {course_code} {course_title}",
        f"Topic: {topic or 'Course-level material'}",
        f"Material ({kind}): {material_title} — {unit_name} {number} of {total}",
    ]
    if title:
        lines.append(f"Title: {title}")
    if body:
        lines.append(f"Text: {body}")
    if visual:
        lines.append(f"Visual description: {visual}")
    if notes:
        lines.append(f"Speaker notes: {notes}")
    return "\n".join(lines)[:MAX_CHUNK_CHARS]


def looks_garbled(text: str) -> bool:
    """A real text layer is ~15% spaces. Broken font encodings print another glyph instead."""
    flat = text.replace("\n", " ")
    letters = sum(c.isalpha() for c in flat)
    if letters < 200:
        return False
    return flat.count(" ") / len(flat) < 0.04
