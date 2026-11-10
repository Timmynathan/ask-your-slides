"""Source files (.cs Unity scripts, PRD F11) → chunks of whole members, cited by line range.

A chunk ends only where a method/member ends (brace depth back at class level), so a method is
never cut in half, except one longer than MAX_LINES, which is split at blank lines. Line numbers
are the file's own, 1-based: "lines 12–48".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

TARGET_LINES = 60
MAX_LINES = 120
_STRINGS = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'')
_COMMENT = re.compile(r"//.*$")


@dataclass
class CodeChunk:
    number: int
    start: int  # first line, 1-based
    lines: list[str]
    language: str

    @property
    def end(self) -> int:
        return self.start + len(self.lines) - 1

    @property
    def label(self) -> str:
        return f"line {self.start}" if self.start == self.end else f"lines {self.start}–{self.end}"

    @property
    def title(self) -> str | None:
        """The first member declared in the chunk, e.g. 'void Update()'."""
        for line in self.lines:
            m = re.match(r"\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|override|virtual|async|sealed|abstract)\s+)*"
                         r"([\w<>\[\],.]+\s+\w+\s*\([^)]*\)|class\s+\w+)", line)
            if m and not line.strip().startswith(("if", "for", "while", "switch", "return", "new ")):
                return m.group(1).strip()
        return None

    @property
    def body(self) -> str:
        return f"```{self.language}\n" + "\n".join(self.lines) + "\n```"

    @property
    def view(self) -> dict:
        return {"type": "code", "language": self.language, "start": self.start, "lines": self.lines}


def _depth_change(line: str) -> int:
    code = _COMMENT.sub("", _STRINGS.sub('""', line))
    return code.count("{") - code.count("}")


def chunks(path: Path, language: str) -> list[CodeChunk]:
    text = path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    lines = text.split("\n")
    while lines and not lines[-1].strip():
        lines.pop()
    # Class-body depth: a file with a namespace has members at depth 2, otherwise 1.
    member_depth = 2 if any(re.match(r"\s*namespace\s+\w", l) and not l.rstrip().endswith(";") for l in lines) else 1

    out: list[CodeChunk] = []
    start = 0
    depth = 0
    in_block_comment = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if in_block_comment or stripped.startswith("/*"):
            in_block_comment = "*/" not in stripped
        else:
            depth += _depth_change(line)
        size = i + 1 - start
        at_boundary = depth <= member_depth and not in_block_comment
        too_long = size >= MAX_LINES and not stripped
        if (size >= TARGET_LINES and at_boundary) or too_long:
            out.append(CodeChunk(len(out) + 1, start + 1, lines[start : i + 1], language))
            start = i + 1
    if start < len(lines):
        rest = lines[start:]
        if out and len(rest) < TARGET_LINES // 3:
            out[-1].lines.extend(rest)  # a short tail (closing braces) joins the last chunk
        else:
            out.append(CodeChunk(len(out) + 1, start + 1, rest, language))
    return out
