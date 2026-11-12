"""Offline tests for the Nov 2026 programmes: placeholder course codes, and reusing vision
descriptions for the same file in another course (nothing paid twice)."""

import json
from pathlib import Path

import pytest
import vision
from chunks import slide_key
from manifest import ManifestError, load
from test_ingestion import make_catalog, make_course, row


def test_placeholder_code_loads_and_is_marked_unconfirmed(tmp_path: Path):
    make_catalog(tmp_path, {"accounting": ["ACC401", "IOH-ETHICS"]})
    make_course(tmp_path, "ACC401", [row(1, "slides/01-a.pdf")], programme="accounting", info={"code_confirmed": False})
    make_course(tmp_path, "IOH-ETHICS", [row(1, "slides/01-a.pdf")], programme="accounting", info={"code_confirmed": False, "aliases": []})
    by_code = {c.code: c for c in load(tmp_path)}
    assert not by_code["IOH-ETHICS"].code_confirmed and not by_code["ACC401"].code_confirmed
    assert slide_key("IOH-ETHICS", 3, 12) == "IOH-ETHICS-03-12"


def test_placeholder_code_must_say_it_is_unconfirmed(tmp_path: Path):
    make_catalog(tmp_path, {"accounting": ["IOH-ETHICS"]})
    make_course(tmp_path, "IOH-ETHICS", [row(1, "slides/01-a.pdf")], programme="accounting", info={"aliases": []})
    with pytest.raises(ManifestError, match="placeholder code; add code_confirmed: false"):
        load(tmp_path)


@pytest.mark.parametrize("code", ["IOH-1ST", "ioh-ethics", "IOH ETHICS", "CSC4200", "ETHICS"])
def test_malformed_codes_are_refused(tmp_path: Path, code: str):
    make_catalog(tmp_path, {"accounting": [code]})
    with pytest.raises(ManifestError, match="bad course code"):
        load(tmp_path)


def test_same_page_in_another_course_reuses_the_description(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(vision, "CACHE", tmp_path)
    calls = []

    class FakeClient:
        class messages:
            @staticmethod
            def create(**kw):
                calls.append(kw)
                usage = type("U", (), {"input_tokens": 10, "output_tokens": 5})
                block = type("B", (), {"type": "text", "text": "A bar chart of ethics scores."})
                return type("R", (), {"content": [block], "stop_reason": "end_turn", "usage": usage})

    monkeypatch.setattr(vision, "_get_client", lambda: FakeClient)
    png, text = b"\x89PNG fake", "Ethics and society"
    first = vision.describe(png, "slides from \"Ethics\" (slides), course IOH-ETHICS Ethics, page 1", text)
    again = vision.describe(png, "slides from \"Ethics\" (slides), course IOH-ETHICS Ethics in Film, page 1", text)
    assert len(calls) == 1 and not first.cached and again.cached and again.text == first.text

    # A description cached before content keys existed (only under its own course's prompt) is
    # found through the twin's `where`, and copied to the content key.
    old_where = "slides from \"Intro\" (slides), course CSC409 Algorithms, page 2"
    old = vision._prompt_path(b"other png", vision._prompt(old_where, "Sorting"))
    old.parent.mkdir(parents=True, exist_ok=True)
    old.write_text(json.dumps({"text": "A sorting diagram.", "refused": False}))
    twin = vision.describe(b"other png", "slides from \"Intro\" (slides), course SEN401 Software, page 2", "Sorting", [old_where])
    assert twin.cached and twin.text == "A sorting diagram." and len(calls) == 1
    assert vision._content_path(b"other png", "Sorting").is_file()


def test_lms_html_entities_are_decoded_and_broken_titles_refused(tmp_path: Path):
    make_catalog(tmp_path, {"computer-science": ["CSC401"]})
    make_course(tmp_path, "CSC401", [{**row(1, "slides/01-a.pdf", topic="Law & Policy"), "lms_section": "Module 4 &amp; 5"}],
                topics=("Law &amp; Policy",))
    (c,) = load(tmp_path)
    assert c.topics[0].title == "Law & Policy" and c.materials[0].section == "Module 4 & 5"


def test_entity_fragment_topic_is_refused(tmp_path: Path):
    make_catalog(tmp_path, {"computer-science": ["CSC401"]})
    make_course(tmp_path, "CSC401", [row(1, "slides/01-a.pdf", topic="Amp;")], topics=("Amp;",))
    with pytest.raises(ManifestError, match="looks broken"):
        load(tmp_path)
