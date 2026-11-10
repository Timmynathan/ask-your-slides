"""What a course file really is, from its bytes, not its extension (PRD F11).

LMS downloads are sometimes mislabelled (two ISM410 "PPTX" files were PDFs). Ingestion trusts this,
and warns when the extension disagrees, so a wrong name can't break a run.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

# Types ingestion can read, and what each one is made of.
SUPPORTED = {
    "pdf": "PDF",
    "pptx": "PowerPoint",
    "ppt": "PowerPoint (old format)",
    "docx": "Word",
    "doc": "Word (old format)",
    "ipynb": "Jupyter notebook",
    "code": "source code",
}
# Plain-text source files, by extension (content is just text, so the extension says the language).
CODE_EXTENSIONS = {".cs": "csharp", ".py": "python", ".js": "javascript", ".ts": "typescript", ".java": "java",
                   ".c": "c", ".cpp": "cpp", ".h": "c", ".sql": "sql", ".r": "r", ".m": "matlab"}
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # old Office (.doc/.ppt/.xls)


def detect(path: Path) -> str | None:
    """'pdf' | 'pptx' | 'ppt' | 'docx' | 'doc' | 'ipynb' | 'code' | None (unknown)."""
    with path.open("rb") as f:
        head = f.read(4096)
    if head.lstrip()[:5] == b"%PDF-" or b"%PDF-" in head[:1024]:
        return "pdf"
    if head[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(path) as z:
                names = set(z.namelist())
        except zipfile.BadZipFile:
            return None
        if "ppt/presentation.xml" in names:
            return "pptx"
        if "word/document.xml" in names:
            return "docx"
        return None
    if head[:8] == OLE_MAGIC:
        # Both old formats share one container; the extension is the only cheap hint.
        return {".doc": "doc", ".ppt": "ppt"}.get(path.suffix.lower(), "ppt")
    if head.lstrip()[:1] == b"{":
        try:
            nb = json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return "ipynb" if isinstance(nb, dict) and isinstance(nb.get("cells"), list) and "nbformat" in nb else None
    if path.suffix.lower() in CODE_EXTENSIONS and _is_text(head):
        return "code"
    return None


def language(path: Path) -> str:
    return CODE_EXTENSIONS.get(path.suffix.lower(), "text")


def expected_from_extension(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in CODE_EXTENSIONS:
        return "code"
    return ext.lstrip(".") if ext.lstrip(".") in SUPPORTED else None


def _is_text(head: bytes) -> bool:
    if b"\x00" in head:
        return False
    try:
        head.decode("utf-8")
        return True
    except UnicodeDecodeError:
        # A 4 KB read can cut a multi-byte character in half; accept if only the tail fails.
        try:
            head[:-4].decode("utf-8")
            return True
        except UnicodeDecodeError:
            return False
