"""Offline tests: manifest validation, titles, chunking, garbled-text detection. No network, no DB."""

from pathlib import Path

import pytest
import yaml

from chunks import build_chunk, image_path, looks_garbled, slide_key
from config import ROOT
from manifest import KINDS, ManifestError, load, title_from_filename


def make_data(tmp_path: Path, materials: list[dict], topics=("Intro", "Parsing"), files=("01-a.pdf", "02-b.pptx")) -> Path:
    (tmp_path / "slides" / "CSC401").mkdir(parents=True)
    for f in files:
        (tmp_path / "slides" / "CSC401" / f).write_bytes(b"x")
    (tmp_path / "courses.yaml").write_text(yaml.safe_dump([{"code": "CSC401", "title": "Compilers", "department": "Computer Science"}]))
    manifest = {"courses": {"CSC401": {
        "topics": [{"order": i + 1, "title": t} for i, t in enumerate(topics)],
        "materials": materials,
    }}}
    (tmp_path / "manifest.yaml").write_text(yaml.safe_dump(manifest))
    return tmp_path


def row(order, file, topic="Intro", kind="slides", cmid=None):
    return {"lms_order": order, "lms_cmid": cmid or 1000 + order, "file": file, "topic": topic, "kind": kind}


def test_real_manifest_is_valid():
    courses = load(ROOT / "data")
    assert courses, "data/manifest.yaml loaded no courses"
    for c in courses:
        assert all(m.kind in KINDS for m in c.materials)
        assert all(m.file.is_file() for m in c.materials)


def test_valid_manifest_and_skipped_rows_are_dropped(tmp_path):
    data = make_data(tmp_path, [
        row(1, "slides/CSC401/01-a.pdf"),
        row(2, "slides/CSC401/02-b.pptx", topic=None, kind="outline"),
        {"lms_order": 3, "lms_cmid": 1003, "file": None, "topic": "Parsing", "kind": "skipped"},
    ])
    [course] = load(data)
    assert [m.order for m in course.materials] == [1, 2]
    assert course.materials[1].topic is None
    assert len(course.skipped) == 1


@pytest.mark.parametrize("bad_row, expected", [
    (row(1, "slides/CSC401/missing.pdf"), "file not found"),
    (row(1, "slides/CSC401/01-a.pdf", topic="Not a topic"), "is not in CSC401's topic list"),
    (row(1, "slides/CSC401/01-a.pdf", kind="lecture"), "unknown kind"),
    (row(1, "../../etc/passwd"), "outside data/"),
    ({"lms_order": 1, "lms_cmid": 1, "file": None, "topic": "Intro", "kind": "slides"}, "needs a file"),
])
def test_bad_rows_fail_before_anything_runs(tmp_path, bad_row, expected):
    data = make_data(tmp_path, [bad_row])
    with pytest.raises(ManifestError) as err:
        load(data)
    assert expected in str(err.value)


def test_duplicate_order_and_cmid_are_rejected(tmp_path):
    data = make_data(tmp_path, [
        row(1, "slides/CSC401/01-a.pdf", cmid=5),
        row(1, "slides/CSC401/02-b.pptx", cmid=5),
    ])
    with pytest.raises(ManifestError) as err:
        load(data)
    assert "duplicate lms_order" in str(err.value)
    assert "lms_cmid 5 also used" in str(err.value)


def test_course_must_be_in_courses_yaml(tmp_path):
    data = make_data(tmp_path, [row(1, "slides/CSC401/01-a.pdf")])
    (data / "courses.yaml").write_text(yaml.safe_dump([{"code": "CSC999", "title": "Other", "department": "Computer Science"}]))
    with pytest.raises(ManifestError, match="not in courses.yaml"):
        load(data)


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
    assert image_path("CSC420", 2, 12) == "CSC420/02/12.png"


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


def test_course_needs_a_department(tmp_path):
    data = make_data(tmp_path, [row(1, "slides/CSC401/01-a.pdf")])
    (data / "courses.yaml").write_text(yaml.safe_dump([{"code": "CSC401", "title": "Compilers"}]))
    with pytest.raises(ManifestError, match="has no department"):
        load(data)
