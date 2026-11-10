"""Offline tests: catalog/course/manifest validation, titles, chunking, garbled-text detection. No network, no DB."""

from pathlib import Path

import pytest
import yaml
from chunks import build_chunk, image_path, looks_garbled, slide_key
from config import ROOT
from manifest import KINDS, ManifestError, load, title_from_filename

SESSION = "2026-2027"


def write_fake(path: Path) -> None:
    """Smallest file that is really of its type (ingestion detects types by content)."""
    import zipfile
    ext = path.suffix.lower()
    if ext in (".pptx", ".docx"):
        inner = "ppt/presentation.xml" if ext == ".pptx" else "word/document.xml"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr(inner, "<x/>")
    elif ext == ".ipynb":
        path.write_text('{"cells": [], "nbformat": 4}')
    elif ext == ".cs":
        path.write_text("class A {}\n")
    else:
        path.write_bytes(b"%PDF-1.4\n%fake\n")


def make_catalog(root: Path, programmes: dict[str, list[str]], school="sst") -> None:
    """programmes: {programme id: [course codes at 400 level, semester 1]}."""
    catalog = {
        "institution": {"id": "pau", "name": "Pan-Atlantic University"},
        "schools": [{"id": school, "name": "School", "programmes": [
            {"id": pid, "name": pid, "department": pid.replace("-", " ").title(),
             "levels": {400: {"semester_1": {"session": SESSION, "courses": codes}}}}
            for pid, codes in programmes.items()
        ]}],
    }
    (root / "pau").mkdir(parents=True, exist_ok=True)
    (root / "pau" / "catalog.yaml").write_text(yaml.safe_dump(catalog, sort_keys=False))


def make_course(root: Path, code: str, materials: list[dict], *, programme="computer-science", topics=("Intro", "Parsing"),
                files=("01-a.pdf", "02-b.pptx"), info: dict | None = None, papers: list | None = None) -> Path:
    course_dir = root / "pau" / "sst" / programme / "400-level" / code
    (course_dir / SESSION / "slides").mkdir(parents=True)
    for f in files:
        write_fake(course_dir / SESSION / "slides" / f)
    course = {"code": code, "title": "Compilers", "institution": "pau", "school": "sst", "programme": programme,
              "department": "Computer Science", "level": 400, "semester": 1, "aliases": ["CSC301"],
              "current_session": SESSION, **(info or {})}
    (course_dir / "course.yaml").write_text(yaml.safe_dump({k: v for k, v in course.items() if v is not None}))
    manifest = {"course": code, "session": SESSION,
                "topics": [{"order": i + 1, "title": t} for i, t in enumerate(topics)], "materials": materials}
    (course_dir / SESSION / "manifest.yaml").write_text(yaml.safe_dump(manifest))
    if papers is not None:
        (course_dir / "past_papers").mkdir()
        write_fake(course_dir / "past_papers" / "2025-2026_exam.pdf")
        (course_dir / "past_papers.yaml").write_text(yaml.safe_dump(papers))
    return course_dir


def make_data(tmp_path: Path, materials: list[dict], **kw) -> Path:
    make_catalog(tmp_path, {"computer-science": ["CSC401"]})
    make_course(tmp_path, "CSC401", materials, **kw)
    return tmp_path


def row(order, file, topic="Intro", kind="slides", cmid=None):
    return {"lms_order": order, "lms_cmid": cmid or 1000 + order, "file": file, "topic": topic, "kind": kind}


def test_real_data_is_valid():
    courses = load(ROOT / "data")
    assert courses, "data/<institution>/catalog.yaml loaded no courses"
    for c in courses:
        assert c.department and c.session and c.level
        assert all(m.kind in KINDS for m in c.materials)
        assert all(m.file.is_file() for m in c.materials)
        assert all(p.file.is_file() for p in c.past_papers)


def test_valid_course_and_skipped_rows_are_dropped(tmp_path):
    data = make_data(tmp_path, [
        row(1, "slides/01-a.pdf"),
        row(2, "slides/02-b.pptx", topic=None, kind="outline"),
        {"lms_order": 3, "lms_cmid": 1003, "file": None, "topic": "Parsing", "kind": "skipped"},
    ])
    [course] = load(data)
    assert course.key == "pau/computer-science/CSC401"
    assert (course.institution, course.school, course.level, course.semester, course.session) == ("pau", "sst", 400, 1, SESSION)
    assert course.aliases == ("CSC301",)
    assert [m.order for m in course.materials] == [1, 2]
    assert course.materials[0].rel_file == f"pau/sst/computer-science/400-level/CSC401/{SESSION}/slides/01-a.pdf"
    assert course.materials[1].topic is None
    assert len(course.skipped) == 1


def test_same_code_in_two_programmes_is_two_courses(tmp_path):
    make_catalog(tmp_path, {"computer-science": ["INS401"], "software-engineering": ["INS401"]})
    make_course(tmp_path, "INS401", [row(1, "slides/01-a.pdf", cmid=7)])
    make_course(tmp_path, "INS401", [row(1, "slides/01-a.pdf", cmid=7), row(2, "slides/02-b.pptx")],
                programme="software-engineering")
    cs, se = load(tmp_path)
    assert (cs.key, se.key) == ("pau/computer-science/INS401", "pau/software-engineering/INS401")
    assert (len(cs.materials), len(se.materials)) == (1, 2)
    assert cs.materials[0].file != se.materials[0].file
    assert cs.matches("INS401") and se.matches("ins401")
    assert se.matches("software-engineering/INS401") and not cs.matches("software-engineering/INS401")
    assert cs.sort_order < se.sort_order


def test_underscore_folders_are_ignored(tmp_path):
    data = make_data(tmp_path, [row(1, "slides/01-a.pdf")])
    parked = data / "pau" / "sst" / "computer-science" / "400-level" / "_CSC499"
    parked.mkdir()
    (parked / "course.yaml").write_text("code: CSC499\n")
    (data / "_legacy").mkdir()
    (data / "_legacy" / "catalog.yaml").write_text("not: valid: yaml: [")
    assert [c.code for c in load(data)] == ["CSC401"]


def test_course_folder_missing_from_catalog_fails(tmp_path):
    data = make_data(tmp_path, [row(1, "slides/01-a.pdf")])
    make_course(data, "CSC402", [row(1, "slides/01-a.pdf")])
    with pytest.raises(ManifestError, match="isn't in pau/catalog.yaml"):
        load(data)


@pytest.mark.parametrize("info, expected", [
    ({"programme": "software-engineering"}, "course.yaml says programme"),
    ({"level": 300}, "course.yaml says level"),
    ({"current_session": "2025-2026"}, "current_session"),
    ({"department": None}, "has no department"),
    ({"title": None}, "has no title"),
    ({"aliases": ["bad"]}, "bad alias"),
])
def test_course_yaml_must_agree_with_the_catalog(tmp_path, info, expected):
    data = make_data(tmp_path, [row(1, "slides/01-a.pdf")], info=info)
    with pytest.raises(ManifestError, match=expected):
        load(data)


def test_catalog_course_without_folder_fails(tmp_path):
    make_catalog(tmp_path, {"computer-science": ["CSC401", "CSC402"]})
    make_course(tmp_path, "CSC401", [row(1, "slides/01-a.pdf")])
    with pytest.raises(ManifestError, match="CSC402/course.yaml is missing"):
        load(tmp_path)


@pytest.mark.parametrize("bad_row, expected", [
    (row(1, "slides/missing.pdf"), "file not found"),
    (row(1, "slides/01-a.pdf", topic="Not a topic"), "is not in CSC401's topic list"),
    (row(1, "slides/01-a.pdf", kind="lecture"), "unknown kind"),
    (row(1, "../../../../../../../etc/passwd"), "outside the course folder"),
    ({"lms_order": 1, "lms_cmid": 1, "file": None, "topic": "Intro", "kind": "slides"}, "needs a file"),
])
def test_bad_rows_fail_before_anything_runs(tmp_path, bad_row, expected):
    data = make_data(tmp_path, [bad_row])
    with pytest.raises(ManifestError) as err:
        load(data)
    assert expected in str(err.value)


def test_duplicate_order_and_cmid_are_rejected(tmp_path):
    data = make_data(tmp_path, [
        row(1, "slides/01-a.pdf", cmid=5),
        row(1, "slides/02-b.pptx", cmid=5),
    ])
    with pytest.raises(ManifestError) as err:
        load(data)
    assert "duplicate lms_order" in str(err.value)
    assert "lms_cmid 5 also used" in str(err.value)


def test_past_papers_are_loaded_and_checked(tmp_path):
    paper = {"file": "past_papers/2025-2026_exam.pdf", "session": "2025/2026", "type": "exam", "scanned": True}
    data = make_data(tmp_path, [row(1, "slides/01-a.pdf")], papers=[paper])
    [course] = load(data)
    [p] = course.past_papers
    assert (p.type, p.session, p.scanned) == ("exam", "2025/2026", True)
    assert p.rel_file.endswith("CSC401/past_papers/2025-2026_exam.pdf")

    for bad, expected in (({"file": "past_papers/nope.pdf"}, "file not found"), ({"type": "essay"}, "unknown type")):
        root = tmp_path / expected.replace(" ", "_")
        make_data(root, [row(1, "slides/01-a.pdf")], papers=[{**paper, **bad}])
        with pytest.raises(ManifestError, match=expected):
            load(root)


@pytest.mark.parametrize("stem, title", [
    ("02-PAU-CSC420-Lecture1-Transactions-Indexing", "Transactions Indexing"),
    ("05-Lecture-5-Operating-Systems-for-IoT-and-Edge-Devices", "Operating Systems for IoT and Edge Devices"),
    ("04-COS409-Lecture-1-Notes", "Lecture 1 Notes"),  # nothing meaningful after "Lecture 1": keep it
    ("15-health-slides", "Health slides"),
])
def test_title_from_filename(stem, title):
    assert title_from_filename(stem) == title


def test_chunk_header_and_keys():
    chunk = build_chunk(
        course_code="CSC420", course_title="Data Management II", topic=None, kind="outline",
        material_title="Outline", unit_name="page", number=2, total=3,
        title="Assessment", body="CA 30%, exam 70%", visual=None, notes=None,
    )
    assert chunk.splitlines()[:3] == [
        "Course: CSC420 Data Management II",
        "Topic: Course-level material",
        "Material (outline): Outline — page 2 of 3",
    ]
    assert "Visual description" not in chunk
    assert slide_key("CSC420", 2, 12) == "CSC420-02-12"
    assert image_path("6f1c0d2e-0000-4000-8000-000000000001", 2, 12) == "6f1c0d2e-0000-4000-8000-000000000001/02/12.png"


def test_garbled_text_layer_is_detected():
    garbled = "sentations!at!which!speakers,!with!a!wave!of!a!hand,!relegate!collection!" * 5
    normal = "A transaction is a unit of program execution that accesses and possibly updates data items. " * 4
    assert looks_garbled(garbled)
    assert not looks_garbled(normal)
    assert not looks_garbled("Short title")  # too little text to judge


def test_symbol_and_substitution_garbling_is_detected():
    symbols = '!! "##! " # #!## # $% & \'(()*+ -. /012(-*-34 56 89:;<=;: >?<<@;?: ' * 6
    substituted = "VZN PQ_MNVNT LX PQ_MNVNT VZN T_]` PWTQaRL^Y [ZLUZ LX QRT VZN XPQ^^Y VL`ZV QRT " * 5
    assert looks_garbled(symbols)
    assert looks_garbled(substituted)


def test_slide_bullet_lists_and_code_are_not_garbled():
    # Real INS401 slide: Title Case terms, no 'the'/'of' — must keep its text layer.
    bullets = ("Inputs / Project Charter / Project management plan / Resource management plan / "
               "Stakeholder engagement plan / Requirements documentation / Stakeholder register / "
               "Enterprise environmental factors / Organizational process assets / Expert judgement / ") * 2
    code = ("BEGIN; UPDATE account SET balance = balance - 100 WHERE account_id = 123; "
            "UPDATE account SET balance = balance + 100 WHERE account_id = 456; COMMIT; ") * 3
    assert not looks_garbled(bullets)
    assert not looks_garbled(code)


def test_sanitize_strips_nul_and_control_characters():
    from chunks import sanitize
    assert sanitize("Privacy\x00 and\x07 data\nline 2\tx") == "Privacy and data\nline 2\tx"
    assert sanitize("\x00\x01") is None
    assert sanitize(None) is None
