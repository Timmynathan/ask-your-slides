"""One chunk per slide/page (PRD §9.2 step 5). The header gives the embedding and the model context."""

from __future__ import annotations

import re

MAX_CHUNK_CHARS = 12_000
# NUL and other C0 control characters (keep \t and \n). PDFs sometimes contain them; Postgres
# text columns reject NUL outright.
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def sanitize(text: str | None) -> str | None:
    if text is None:
        return None
    return _CONTROL.sub("", text).strip() or None


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
    """True when a page's text layer can't be trusted, so the page should be transcribed from its image.

    Broken font encodings seen in the course PDFs:
      - spaces printed as another glyph ('sentations!at!which!speakers')  → almost no spaces
      - glyphs mapped to symbols ('!! "##! " #  #!## # $% &')           → few letters
      - letters substituted ('VZN' for 'the', 'QRT' for 'and')           → many words with no vowel
    Real text (prose, bullet lists, code) is ~85% letters among non-space characters, ~15% spaces,
    and almost every 3+ letter word has a vowel.
    """
    flat = " ".join(text.split())
    non_space = len(flat) - flat.count(" ")
    if non_space < 200:
        return False  # too little text to judge
    letters = sum(c.isalpha() for c in flat)
    if flat.count(" ") / len(flat) < 0.04:
        return True
    if letters / non_space < 0.5:
        return True
    words = [w for w in (t.strip(".,;:!?()[]\"'-") for t in flat.split()) if len(w) >= 3 and w.isalpha()]
    if len(words) < 30:
        return False
    vowelless = sum(1 for w in words if not any(v in w.lower() for v in "aeiouy"))
    return vowelless / len(words) > 0.25
