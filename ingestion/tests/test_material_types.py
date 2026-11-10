"""Offline tests for the new material types (PRD F11): type by content, Word sections, notebooks, code."""

import itertools
import json
from pathlib import Path

import code_extract
import docx
import docx_extract
import filetype
import notebook_extract
import pymupdf
from manifest import load, material_source


def make_pdf(path: Path, pages: list[str]) -> Path:
    doc = pymupdf.open()
    for text in pages:
        doc.new_page().insert_text((72, 72), text)
    doc.save(path)
    return path


# ── type by content ─────────────────────────────────────────
def test_type_comes_from_content_not_extension(tmp_path: Path):
    fake = make_pdf(tmp_path / "Character-Design.pptx", ["really a PDF"])  # the ISM410 case
    assert filetype.detect(fake) == "pdf"
    d = docx.Document()
    d.add_paragraph("hello")
    d.save(tmp_path / "notes.docx")
    assert filetype.detect(tmp_path / "notes.docx") == "docx"
    (tmp_path / "nb.ipynb").write_text(json.dumps({"cells": [], "nbformat": 4}))
    assert filetype.detect(tmp_path / "nb.ipynb") == "ipynb"
    (tmp_path / "Player.cs").write_text("using UnityEngine;\npublic class P : MonoBehaviour {}\n")
    assert filetype.detect(tmp_path / "Player.cs") == "code" and filetype.language(tmp_path / "Player.cs") == "csharp"
    (tmp_path / "junk.pdf").write_bytes(b"\x00\x01binary")
    assert filetype.detect(tmp_path / "junk.pdf") is None
    (tmp_path / "data.json").write_text('{"a": 1}')
    assert filetype.detect(tmp_path / "data.json") is None


# ── Word ────────────────────────────────────────────────────
def law_notes(path: Path) -> Path:
    d = docx.Document()
    d.add_paragraph().add_run("LAW OF PRIVACY").bold = True
    d.add_paragraph("Privacy is the right of an individual to be left alone. " * 4)
    d.add_paragraph().add_run("Legal Basis of Privacy in Nigeria").bold = True
    d.add_paragraph("Section 37 of the 1999 Constitution guarantees privacy. " * 12)
    d.add_paragraph().add_run("B. Statutory Bases").bold = True
    d.add_paragraph("Nigeria Data Protection Act 2023 sets the principles. " * 30)
    item = d.add_paragraph(style="List Bullet")
    item.add_run("Data Protection Commission").bold = True  # a bold list item is not a heading
    d.add_paragraph().add_run("Exceptions").bold = True
    d.add_paragraph("Public interest, consent and lawful authority are exceptions. " * 14)
    d.save(path)
    return path


def test_word_headings_paths_and_chunk_sizes(tmp_path: Path):
    secs = docx_extract.sections(law_notes(tmp_path / "08-LAW-OF-PRIVACY.docx"))
    labels = [s.label for s in secs]
    assert labels[0] == "Law of Privacy"  # ALL CAPS heading, title-cased
    assert "Law of Privacy › B. Statutory Bases" in labels  # middle level left out of the chip label
    assert any(s.path == "Law of Privacy › Legal Basis of Privacy in Nigeria › B. Statutory Bases" for s in secs)
    assert "Law of Privacy › Exceptions" in labels
    assert not any("Data Protection Commission" in s.label for s in secs)
    assert all(len(s.body) <= docx_extract.TARGET_CHARS + 600 for s in secs)  # long sections split at paragraphs
    assert [s.number for s in secs] == list(range(1, len(secs) + 1))


def test_word_sections_find_their_page(tmp_path: Path):
    secs = docx_extract.sections(law_notes(tmp_path / "n.docx"))
    pages = [" ".join(s.body.replace("*", "") for s in secs[:2]), " ".join(s.body.replace("*", "") for s in secs[2:])]
    starts = docx_extract.page_of_sections(secs, pages)
    assert starts[0] == 1 and starts[-1] == 2 and starts == sorted(starts)


def test_heading_level_rules():
    assert docx_extract.title_case("LAW OF THE MEDIA") == "Law of the Media"
    assert docx_extract.short_label(("A", "B", "C")) == "A › C"


# ── notebooks ───────────────────────────────────────────────
def test_notebook_cells_in_order_code_never_split(tmp_path: Path):
    big = "x = 1\n" * 500  # longer than a chunk on its own
    nb = {"nbformat": 4, "cells": [
        {"cell_type": "markdown", "source": ["# NumPy basics\n", "Arrays."]},
        {"cell_type": "code", "source": "import numpy as np\nprint(np.arange(3))", "outputs": [{"output_type": "stream", "text": "[0 1 2]\n"}]},
        {"cell_type": "code", "source": "", "outputs": []},
        {"cell_type": "code", "source": big, "outputs": [{"output_type": "display_data", "data": {"image/png": "..."}}]},
        {"cell_type": "markdown", "source": "Done."},
    ]}
    (tmp_path / "n.ipynb").write_text(json.dumps(nb))
    chunks = notebook_extract.chunks(tmp_path / "n.ipynb")
    assert [c.label for c in chunks] == ["Cells 1–2", "Cell 4", "Cell 5"]  # cell 3 is empty but keeps its number
    assert chunks[0].title == "NumPy basics"
    assert "[0 1 2]" in chunks[0].body and "```python" in chunks[0].body
    assert chunks[1].cells[0].source == big.rstrip() and chunks[1].cells[0].output == "[image output]"
    assert chunks[0].view["cells"][1] == {"n": 2, "type": "code", "source": "import numpy as np\nprint(np.arange(3))", "output": "[0 1 2]"}


# ── code ────────────────────────────────────────────────────
def test_code_chunks_end_at_members_with_line_numbers(tmp_path: Path):
    methods = "\n".join(
        f"    void Method{i}()\n    {{\n" + "".join(f"        x += {j}; // {{ not a brace\n" for j in range(12)) + "    }\n"
        for i in range(8)
    )
    src = "using UnityEngine;\n\npublic class PlayerMovement : MonoBehaviour\n{\n" + methods + "}\n"
    (tmp_path / "PlayerMovement.cs").write_text(src)
    chunks = code_extract.chunks(tmp_path / "PlayerMovement.cs", "csharp")
    lines = src.rstrip("\n").split("\n")
    assert len(chunks) > 1
    assert chunks[0].start == 1 and chunks[-1].end == len(lines)
    assert all(b.start == a.end + 1 for a, b in itertools.pairwise(chunks))  # contiguous, nothing lost
    for c in chunks[:-1]:
        assert c.lines[-1].strip() in ("}", "")  # every chunk but the last ends where a member ends
    assert chunks[0].label.startswith("lines 1–") and chunks[0].title == "class PlayerMovement"
    assert chunks[0].view["start"] == 1 and chunks[0].view["language"] == "csharp"


# ── trust, electives ────────────────────────────────────────
def test_student_work_and_electives(tmp_path: Path):
    assert material_source("Student group presentation (Group 10), not lecturer material - lower trust.") == "student"
    assert material_source("Current take-home CA brief. Not a past paper.") == "lecturer"
    assert material_source(None) == "lecturer"

    from tests.test_ingestion import make_catalog, make_course

    make_catalog(tmp_path, {"computer-science": ["CSC401"]})
    make_course(tmp_path, "CSC401", [{"lms_order": 1, "lms_cmid": 1, "file": "slides/01-a.pdf", "topic": "Intro", "kind": "other",
                                      "review": "Student group presentation (Group 3)"}], info={"elective": True})
    course = load(tmp_path)[0]
    assert course.elective is True
    assert course.materials[0].source == "student" and course.materials[0].file_type == "pdf"


def test_mislabelled_file_loads_by_content(tmp_path: Path):
    from tests.test_ingestion import make_catalog, make_course

    make_catalog(tmp_path, {"computer-science": ["CSC401"]})
    d = make_course(tmp_path, "CSC401", [{"lms_order": 1, "lms_cmid": 1, "file": "slides/02-b.pptx", "topic": "Intro", "kind": "slides"}])
    make_pdf(d / "2026-2027" / "slides" / "02-b.pptx", ["a PDF named .pptx"])
    assert load(tmp_path)[0].materials[0].file_type == "pdf"


def test_programmes_from_the_catalog(tmp_path: Path):
    from manifest import programmes
    from tests.test_ingestion import make_catalog

    make_catalog(tmp_path, {"computer-science": ["CSC401"], "software-engineering": ["SEN401"]})
    ps = programmes(tmp_path)
    assert [(p.id, p.department, p.school, p.sort_order) for p in ps] == [
        ("computer-science", "Computer Science", "sst", 1), ("software-engineering", "Software Engineering", "sst", 2)]
