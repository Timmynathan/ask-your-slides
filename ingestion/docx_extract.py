"""Word notes (.docx) → sections with heading paths (PRD F11).

PAU lecturers' notes rarely use Word's heading styles (ISM413: every paragraph is "Normal"), so a
heading is recognised from its formatting as well:
  level 1  a Heading 1/Title style, or a short, bold, ALL-CAPS line      "LAW OF PRIVACY"
  level 2  a Heading 2 style, or a short bold line                       "Legal Basis of Privacy in Nigeria"
  level 3  a Heading 3+ style, or a short bold "1. …"/"A. …" line          "B. Statutory Bases"
Bullet/numbered list items are never headings, even when bold.

Sections are chunked to about 500 tokens: long sections split at paragraph boundaries, short
neighbours merged. Each chunk keeps the heading path of its first section, for citations
("Law of Privacy › Legal Basis of Privacy in Nigeria").
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import docx
from docx.document import Document as DocumentObject
from docx.table import Table
from docx.text.paragraph import Paragraph

TARGET_CHARS = 2000  # ≈ 500 tokens
MERGE_BELOW = 700  # a section shorter than this joins the next one (same chunk)
TAIL_MERGE = 250
HEADING_MAX_CHARS = 100
SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "via", "with"}
NUMBERED = re.compile(r"^\s*(\d{1,2}|[A-Za-z]|[ivxIVX]{1,4})[.)]\s+\S")


@dataclass
class Block:
    path: tuple[str, ...]  # heading path in force for this block
    text: str  # Markdown (paragraphs, "- " list items, tables)
    heading: str | None = None  # set when the block is itself a heading


@dataclass
class Section:
    number: int  # 1-based, in document order
    label: str  # short heading path for citations
    path: str  # full heading path, for the chunk text
    title: str | None  # deepest heading
    body: str  # Markdown
    first_line: str  # for finding the section's page in the PDF rendering


def title_case(s: str) -> str:
    """'LAW OF PRIVACY' → 'Law of Privacy'; mixed case is left alone."""
    if s.upper() != s:
        return s
    words = s.lower().split()
    return " ".join(w if i and w in SMALL_WORDS else w[:1].upper() + w[1:] for i, w in enumerate(words))


def _is_list(p: Paragraph) -> bool:
    ppr = p._p.pPr
    return (ppr is not None and ppr.numPr is not None) or p.style.name.lower().startswith("list")


def _all_bold(p: Paragraph) -> bool:
    runs = [r for r in p.runs if r.text.strip()]
    if not runs:
        return False
    style_bold = bool(p.style.font.bold)
    return all(r.bold or (r.bold is None and style_bold) for r in runs)


def heading_level(p: Paragraph) -> int | None:
    t = p.text.strip()
    if not t:
        return None
    name = p.style.name.lower()
    m = re.match(r"heading (\d)", name)
    if m:
        return min(3, int(m.group(1)))
    if name == "title":
        return 1
    if _is_list(p) or len(t) > HEADING_MAX_CHARS or not _all_bold(p) or t.endswith((".", ",", ";")):
        return None
    if t.upper() == t and any(c.isalpha() for c in t):
        return 1
    if NUMBERED.match(t):
        return 3
    return 2


def _table_markdown(t: Table) -> str:
    rows = [[" ".join(c.text.split()) for c in r.cells] for r in t.rows]
    if not rows:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
    lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(lines)


def blocks(path: Path) -> list[Block]:
    doc: DocumentObject = docx.Document(str(path))
    out: list[Block] = []
    stack: list[str] = []  # heading texts by level (index 0 = level 1)
    for el in doc.element.body.iterchildren():
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(el, doc)
            text = " ".join(p.text.split())
            if not text:
                continue
            level = heading_level(p)
            if level:
                stack = stack[: level - 1] + [title_case(text)]
                out.append(Block(tuple(stack), text, heading=title_case(text)))
            else:
                out.append(Block(tuple(stack), f"- {text}" if _is_list(p) else text))
        elif tag == "tbl":
            md = _table_markdown(Table(el, doc))
            if md:
                out.append(Block(tuple(stack), md))
    return out


def sections(path: Path) -> list[Section]:
    """Chunked sections of a Word document, in order."""
    # Group blocks into raw sections: a new one starts at every heading.
    raw: list[tuple[tuple[str, ...], list[str], str | None]] = []
    for b in blocks(path):
        if b.heading or not raw:
            raw.append((b.path, [], b.heading))
        if b.heading:
            raw[-1][1].append(f"**{b.text}**")
        else:
            raw[-1][1].append(b.text)

    # Merge short neighbours; split long ones at paragraph boundaries.
    chunks: list[tuple[tuple[str, ...], str | None, list[str]]] = []
    for path_, paras, heading in raw:
        size = sum(len(x) for x in paras)
        if chunks and sum(len(x) for x in chunks[-1][2]) < MERGE_BELOW and sum(len(x) for x in chunks[-1][2]) + size <= TARGET_CHARS:
            chunks[-1][2].extend(paras)
            continue
        current: list[str] = []
        for para in paras:
            if current and sum(len(x) for x in current) + len(para) > TARGET_CHARS:
                chunks.append((path_, heading, current))
                current = []
            current.append(para)
        if current:
            chunks.append((path_, heading, current))

    # A tiny chunk (a lone heading, a closing line) joins its neighbour: the next one (keeping its
    # own label, since it starts there), or the previous one at the end.
    i = 0
    while len(chunks) > 1 and i < len(chunks):
        if sum(len(x) for x in chunks[i][2]) >= TAIL_MERGE:
            i += 1
        elif i + 1 < len(chunks):
            path_, heading, paras = chunks[i]
            chunks[i] = (path_, heading, paras + chunks.pop(i + 1)[2])
        else:
            chunks[i - 1][2].extend(chunks.pop(i)[2])

    out = []
    for i, (path_, heading, paras) in enumerate(chunks, 1):
        label = short_label(path_) or f"Section {i}"  # text before the document's first heading
        first = next((p for p in paras if p.strip("* ")), "")
        out.append(Section(i, label, " › ".join(path_), heading or (path_[-1] if path_ else None), "\n\n".join(paras), first.strip("* ")[:120]))
    return out


def short_label(path: tuple[str, ...]) -> str:
    """Chip label: the document heading and the deepest one ('Law of Privacy › 1. Damages'). Middle
    levels are left out: in notes without heading styles they are the least reliable."""
    if len(path) <= 2:
        return " › ".join(path)
    return f"{path[0]} › {path[-1]}"


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def page_of_sections(secs: list[Section], page_texts: list[str]) -> list[int]:
    """The PDF page (1-based) each section starts on, found by its first line in the rendered PDF's
    text; a section that can't be found takes the previous one's page. Pages never go backwards."""
    pages = [norm(t) for t in page_texts]
    out: list[int] = []
    start = 0
    for s in secs:
        needle = norm(s.first_line)[:60]
        found = None
        if needle:
            for i in range(start, len(pages)):
                if needle in pages[i]:
                    found = i
                    break
            if found is None and len(needle) > 25:  # a line broken across pages: try its first half
                half = needle[: len(needle) // 2]
                found = next((i for i in range(start, len(pages)) if half in pages[i]), None)
        page = found if found is not None else start
        out.append(page + 1)
        start = page
    return out
