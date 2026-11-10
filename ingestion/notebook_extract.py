"""Jupyter notebooks (.ipynb) → chunks of consecutive cells (PRD F11).

Markdown and code cells are kept in order; a code cell is never split across chunks (a very long
one becomes a chunk of its own). Cells are numbered 1, 2, … in notebook order (all cells, as the
student sees them), and chunks are cited by cell: "Cell 4" or "Cells 4–6".

Text outputs (print, values, errors) are kept, shortened; images and HTML outputs are noted, not
copied. The viewer shows the cells themselves (`view` below), like Jupyter.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

TARGET_CHARS = 2000  # ≈ 500 tokens
OUTPUT_CHARS = 600


@dataclass
class Cell:
    number: int
    type: str  # 'markdown' | 'code'
    source: str
    output: str | None = None


@dataclass
class Chunk:
    number: int
    cells: list[Cell] = field(default_factory=list)

    @property
    def label(self) -> str:
        a, b = self.cells[0].number, self.cells[-1].number
        return f"Cell {a}" if a == b else f"Cells {a}–{b}"

    @property
    def title(self) -> str | None:
        for c in self.cells:
            if c.type == "markdown":
                for line in c.source.splitlines():
                    if line.lstrip().startswith("#"):
                        return line.lstrip("# ").strip() or None
        return None

    @property
    def body(self) -> str:
        """Markdown for the chunk text: cells in order, code fenced, outputs shown."""
        parts = []
        for c in self.cells:
            if c.type == "markdown":
                parts.append(f"[Cell {c.number}, markdown]\n{c.source}")
            else:
                parts.append(f"[Cell {c.number}, code]\n```python\n{c.source}\n```")
                if c.output:
                    parts.append(f"Output:\n```\n{c.output}\n```")
        return "\n\n".join(parts)

    @property
    def view(self) -> dict:
        return {"type": "notebook", "cells": [{"n": c.number, "type": c.type, "source": c.source, "output": c.output} for c in self.cells]}

    def size(self) -> int:
        return sum(len(c.source) + len(c.output or "") for c in self.cells)


def _text(v) -> str:
    return "".join(v) if isinstance(v, list) else str(v or "")


def _output(outputs: list) -> str | None:
    parts = []
    for o in outputs or []:
        t = o.get("output_type")
        if t == "stream":
            parts.append(_text(o.get("text")))
        elif t in ("execute_result", "display_data"):
            data = o.get("data") or {}
            if "text/plain" in data:
                parts.append(_text(data["text/plain"]))
            elif any(k.startswith("image/") for k in data):
                parts.append("[image output]")
            elif "text/html" in data:
                parts.append("[table/HTML output]")
        elif t == "error":
            parts.append(f"{o.get('ename', 'Error')}: {o.get('evalue', '')}")
    text = "\n".join(p.rstrip() for p in parts if p.strip())
    if not text:
        return None
    return text if len(text) <= OUTPUT_CHARS else text[:OUTPUT_CHARS].rstrip() + "\n…"


def cells(path: Path) -> list[Cell]:
    nb = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for c in nb.get("cells", []):
        kind = c.get("cell_type")
        if kind not in ("markdown", "code"):
            continue
        src = _text(c.get("source")).rstrip()
        out.append(Cell(len(out) + 1, kind, src, _output(c.get("outputs")) if kind == "code" else None))
    return out


def chunks(path: Path) -> list[Chunk]:
    """Consecutive cells up to ~500 tokens; empty cells are skipped but keep their numbers."""
    out: list[Chunk] = []
    current = Chunk(1)
    for c in cells(path):
        if not c.source.strip():
            continue
        size = len(c.source) + len(c.output or "")
        if current.cells and current.size() + size > TARGET_CHARS:
            out.append(current)
            current = Chunk(len(out) + 1)
        current.cells.append(c)
    if current.cells:
        out.append(current)
    return out
