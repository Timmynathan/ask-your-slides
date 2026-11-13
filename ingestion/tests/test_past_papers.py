"""Offline tests for past papers (PRD §9.4): checks, review files, request building. No network, no DB."""

from pathlib import Path

import pymupdf
import pytest
from past_validate import (
    apply_review,
    check,
    expected_parent,
    normalize_code,
    parse_number,
)


def q(number, text="Explain it.", marks=None, type="explain", parent=..., section=None, **kw):
    if parent is ...:
        parent = expected_parent(number)
    return {"number": number, "parent": parent, "section": section, "text": text, "marks": marks, "type": type,
            "options": kw.pop("options", []), "confidence": kw.pop("confidence", "high"), "unreadable": kw.pop("unreadable", False),
            "note": kw.pop("note", None), **kw}


def paper(total=None, **kw):
    return {"code_on_paper": kw.pop("code", "CSC 420"), "title_on_paper": None, "session_on_paper": None, "total_marks": total,
            "duration": None, "instructions": None, "answer_total": kw.pop("answer_total", None),
            "compulsory": kw.pop("compulsory", []), "sections": kw.pop("sections", [])}


def codes(checked, severity=None):
    return sorted(p.key for p in checked.problems if severity is None or p.severity == severity)


def test_parse_number():
    assert parse_number("Q2") == (2, None, None)
    assert parse_number("Q2b") == (2, 2, None)
    assert parse_number("Q2b(iii)") == (2, 2, 3)
    assert parse_number("2b") is None
    assert parse_number("Q2(i)") is None
    assert normalize_code("PAU-CSC 412") == "CSC412"


def test_clean_paper_with_choice_rubric_is_ok():
    ex = {"paper": paper(total=60, answer_total=3, compulsory=["Q1"]),
          "questions": [q("Q1", "", None), q("Q1a", marks=10), q("Q1b", marks=10), q("Q2", marks=20), q("Q3", marks=20), q("Q4", marks=20)]}
    c = check(ex, course_code="CSC420")
    assert c.status == "ok" and codes(c, "warning") == []
    assert [x["marks"] for x in c.questions] == [20, 10, 10, 20, 20, 20]  # Q1 takes its parts' sum
    assert [x["number"] for x in c.questions] == ["Q1", "Q1a", "Q1b", "Q2", "Q3", "Q4"]


def test_total_that_rubric_cannot_reach_is_a_warning():
    ex = {"paper": paper(total=70, answer_total=3, compulsory=["Q1"]),
          "questions": [q("Q1", marks=20), q("Q2", marks=20), q("Q3", marks=20), q("Q4", marks=20)]}
    c = check(ex, course_code="CSC420")
    assert c.status == "ok" and codes(c, "warning") == ["total_marks"]


def test_sections_rubric():
    ex = {"paper": paper(total=50, sections=[{"name": "A", "instructions": None, "choose": None},
                                             {"name": "B", "instructions": None, "choose": 1}]),
          "questions": [q("Q1", marks=10, section="A"), q("Q2", marks=10, section="A"),
                        q("Q3", marks=30, section="B"), q("Q4", marks=30, section="B")]}
    assert codes(check(ex, course_code="CSC420")) == []


def test_parts_that_do_not_add_up():
    ex = {"paper": paper(), "questions": [q("Q1", "", 10), q("Q1a", marks=4), q("Q1b", marks=5)]}
    assert codes(check(ex, course_code="CSC420"), "warning") == ["subparts_sum:Q1"]


def test_gaps_bad_numbers_and_missing_parents_block():
    ex = {"paper": paper(), "questions": [q("Q1", marks=5), q("Q3", marks=5), q("Q3b", marks=2, parent="Q3"),
                                          q("Question 4", marks=5, parent=None), q("Q5a", marks=1, parent="Q5")]}
    c = check(ex, course_code="CSC420")
    assert c.status == "needs_review"
    blocking = codes(c, "blocking")
    assert "numbering_format:Question 4" in blocking
    assert "missing_parent:Q5a" in blocking
    assert "numbering_gap" in blocking  # Q2, Q4 missing
    assert "numbering_gap:Q3" in blocking  # Q3a missing


def test_unreadable_low_confidence_and_mcq_without_options_block():
    ex = {"paper": paper(), "questions": [
        q("Q1", "What is [unreadable]?", 2), q("Q2", marks=2, confidence="low"),
        q("Q3", "Pick one", 1, type="mcq"), q("Q4", marks=1, confidence="medium")]}
    c = check(ex, course_code="CSC420")
    assert codes(c, "blocking") == ["low_confidence:Q2", "mcq_options:Q3", "unreadable:Q1"]
    assert codes(c, "warning") == ["medium_confidence:Q4"]


def test_old_code_on_paper_is_fine_but_unknown_code_needs_the_title():
    base = {"questions": [q("Q1", marks=5)]}
    assert codes(check({**base, "paper": paper(code="CSC 403")}, course_code="CSC420", aliases=("CSC403",))) == ["no_total"]
    # A different code alone: it may be another course → held back.
    c = check({**base, "paper": paper(code="CSC 999")}, course_code="CSC420", aliases=("CSC403",))
    assert codes(c, "blocking") == ["code_mismatch"] and c.status == "needs_review"
    # A renumbered course that prints its own title: only a warning.
    titled = {**base, "paper": {**paper(code="CSC 999"), "title_on_paper": "Data Management II"}}
    c = check(titled, course_code="CSC420", course_title="Data Management II")
    assert codes(c, "warning") == ["code_mismatch"] and c.status == "ok"


def test_guessed_course_must_be_confirmed_by_the_paper():
    base = {"questions": [q("Q1", marks=5)]}
    title = "Advanced Financial Reporting"
    # Guessed from the archive folder, nothing printed → held back until the owner confirms.
    c = check({**base, "paper": paper(code=None)}, course_code="ACC401", course_title=title, guessed=True)
    assert codes(c, "blocking") == ["course_unconfirmed"]
    assert check({**base, "paper": paper(code=None)}, course_code="ACC401", course_title=title, guessed=True,
                 accepted={"course_unconfirmed"}).status == "ok"
    # Guessed, and the paper prints another code (even with a matching title) → held back.
    other = {**base, "paper": {**paper(code="ACC 403"), "title_on_paper": title}}
    assert codes(check(other, course_code="ACC401", course_title=title, guessed=True), "blocking") == ["code_mismatch"]
    # Guessed and confirmed by the printed code and title → published.
    same = {**base, "paper": {**paper(code="ACC 401"), "title_on_paper": title}}
    assert check(same, course_code="ACC401", course_title=title, guessed=True).status == "ok"
    # Not guessed and nothing printed: nothing to object to.
    assert check({**base, "paper": paper(code=None)}, course_code="ACC401", course_title=title).status == "ok"


def test_course_match_verdicts_for_the_report():
    from past_validate import course_match

    kw = {"course_code": "ECO406", "course_title": "Monetary Economics"}
    assert course_match({"code_on_paper": "ECO 406", "title_on_paper": None}, **kw)[0] == "match"
    assert course_match({"code_on_paper": "ECO 416", "title_on_paper": "Monetary Economics"}, **kw)[0] == "match"
    assert course_match({"code_on_paper": "ECO 416", "title_on_paper": None}, **kw)[0] == "mismatch"
    assert course_match({"code_on_paper": "ECO 406", "title_on_paper": "Public Finance"}, **kw)[0] == "mismatch"
    assert course_match({"code_on_paper": None, "title_on_paper": None}, **kw)[0] == "unconfirmed"
    # A reused paper's source code counts (SEN412 = CSC412).
    assert course_match({"code_on_paper": "CSC 412", "title_on_paper": None}, course_code="SEN412", listed_codes=("CSC412",))[0] == "match"


def test_review_file_fixes_and_accepts():
    ex = {"paper": paper(total=30), "questions": [q("Q1", "", 10), q("Q1a", marks=4), q("Q1b", marks=5), q("Q2", marks=20), q("Q9", marks=1)]}
    review = {"questions": {"Q1b": {"marks": 6}}, "drop": ["Q9"], "accept": ["no_total"], "paper": {"total_marks": 30}}
    fixed, accepted = apply_review(ex, review)
    c = check(fixed, course_code="CSC420", accepted=accepted)
    assert codes(c, "blocking") == [] and codes(c, "warning") == []
    assert [x["number"] for x in c.questions] == ["Q1", "Q1a", "Q1b", "Q2"]

    c2 = check(ex, course_code="CSC420", accepted={"subparts_sum:Q1", "numbering_gap", "total_marks"})
    assert codes(c2, "warning") == [] and c2.status == "ok"  # accepted problems become info

    with pytest.raises(ValueError):
        apply_review(ex, {"questions": {"Q7": {"marks": 1}}})


def test_build_params_sends_pages_in_order_with_schema(tmp_path: Path):
    from manifest import PastPaper
    from past_papers import EXTRACT_SCHEMA, build_params, render_pages

    pdf = tmp_path / "p.pdf"
    doc = pymupdf.open()
    for i in range(2):
        page = doc.new_page()
        page.insert_text((72, 72), f"Question {i + 1}: explain normalisation in a database course paper.")
    doc.save(pdf)
    pages = render_pages(pdf)
    assert len(pages) == 2 and pages[0][0][:2] == b"\xff\xd8"  # JPEG

    class C:
        institution, code, title, aliases = "pau", "CSC420", "Data Management II", ("CSC403",)

    pp = PastPaper(file=pdf, rel_file="x/p.pdf", session="2025/2026", type="exam", code_on_paper="CSC 403", scanned=False,
                   instructions="Answer all", duration="2h")
    params = build_params(C, pp, pages)
    content = params["messages"][0]["content"]
    assert [b["type"] for b in content] == ["text", "image", "text", "image", "text"]
    assert content[0]["text"] == "Page 1:" and content[2]["text"] == "Page 2:"
    prompt = content[-1]["text"]
    assert "CSC420 Data Management II (older codes: CSC403)" in prompt and "<text_layer>" in prompt
    assert params["output_config"]["format"]["schema"] is EXTRACT_SCHEMA
    assert "thinking" not in params  # Sonnet 5.5 rejects disabled thinking; effort sets the depth


def test_manifest_reads_paper_fields(tmp_path: Path):
    import yaml
    from manifest import load
    from tests.test_ingestion import make_catalog, make_course

    make_catalog(tmp_path, {"computer-science": ["CSC401"]})
    d = make_course(tmp_path, "CSC401", [{"lms_order": 1, "lms_cmid": 1, "file": "slides/01-a.pdf", "topic": "Intro", "kind": "slides"}])
    (d / "past_papers").mkdir()
    (d / "past_papers" / "e.pdf").write_bytes(b"%PDF-1.4\n")
    (d / "past_papers.yaml").write_text(yaml.safe_dump([{"file": "past_papers/e.pdf", "session": "2025/2026", "type": "exam",
                                                          "pages": 3, "instructions": "Answer all", "duration": "2h", "note": "n"}]))
    p = load(tmp_path)[0].past_papers[0]
    assert (p.pages, p.instructions, p.duration, p.note) == (3, "Answer all", "2h", "n")


def test_golden_compare():
    from past_golden import compare, similarity

    assert similarity("Describe **Scope Creep**, including its implications.", "Describe scope creep including its implications") == 1.0
    golden = {"answer_total": 3, "compulsory": ["Q1"], "questions": [
        {"number": "Q1", "marks": 10, "text": "Explain normal forms in databases"},
        {"number": "Q2", "marks": 5, "text": "Define a key", "text_min": 0.5}]}
    good = {"raw": {"paper": {"answer_total": 3, "compulsory": ["Q1"]}}, "checked": [
        {"number": "Q1", "marks": 10.0, "text": "Explain normal forms in databases."},
        {"number": "Q2", "marks": 5, "text": "Define a primary key"}]}
    assert compare(golden, good) == []
    bad = {"raw": {"paper": {"answer_total": 2, "compulsory": ["Q1"]}}, "checked": [
        {"number": "Q1", "marks": 8, "text": "Something else entirely"}, {"number": "Q3", "marks": 5, "text": "x"}]}
    assert compare(golden, bad) == [
        "Q2: missing", "Q3: extra entry", "Q1: marks 8 ≠ 10", "Q1: text similarity 0.00 < 0.90", "paper answer_total: 2 ≠ 3"]


def test_check_analysis_drops_bad_citations_and_checks_scheme():
    from past_analysis import QuestionJob, check_analysis

    topics = [{"id": "t1", "topic_order": 1, "title": "Scope"}, {"id": "t2", "topic_order": 2, "title": "Risk"}]
    job = QuestionJob(id="q", course_id="c", number="Q2a", text="Describe scope creep.", marks=5, type="explain",
                      options=None, context=[], paper="2025/2026 exam", slides=[{"slide_key": "INS401-03-4"}])
    raw = {"topics": [1, 9], "relevance": "covered", "relevance_note": "", "answer_key": "B", "explanation": "x",
           "model_answer": "Scope creep is uncontrolled growth. [[s:INS401-03-4]] It hurts budgets. [[s:INS401-99-1]]",
           "marking_scheme": [{"point": "definition", "marks": 2}, {"point": "implications", "marks": 2}]}
    a = check_analysis(raw, job, topics)
    assert a.topics == ["t1"]
    assert "[[s:INS401-03-4]]" in a.model_answer and "INS401-99-1" not in a.model_answer
    assert a.answer_key is None and a.explanation is None  # not an MCQ
    assert any("adds up to 4" in p for p in a.problems)
    assert any("unknown topic" in p for p in a.problems) and any("dropped citation" in p for p in a.problems)

    mcq = QuestionJob(id="m", course_id="c", number="Q1", text="Pick", marks=1, type="mcq",
                      options=[{"label": "A", "text": "a"}, {"label": "B", "text": "b"}], context=[], paper="p", slides=[])
    ok = check_analysis({**raw, "topics": [2], "marking_scheme": [{"point": "B", "marks": 1}], "model_answer": "B"}, mcq, topics)
    assert ok.answer_key == "B" and ok.problems == []


def test_review_renumber_restructures_broken_numbering():
    ex = {"paper": paper(), "questions": [
        q("Q1", "i. First statement.", None, parent=None), q("Q2", "ii. Second statement.", None, parent=None),
        q("Q1b", "Essay task", None, parent=None), q("Q2", "Design task", None, parent=None)]}
    review = {"renumber": ["Q1a", "Q1b", "Q2a", None],
              "add": [{"number": "Q1", "text": "True or false?", "marks": 3, "type": "explain"},
                      {"number": "Q2", "text": "", "marks": 10, "type": "essay"}],
              "questions": {"Q1a": {"marks": 1.5}, "Q1b": {"marks": 1.5}}}
    fixed, _ = apply_review(ex, review)
    c = check(fixed, course_code="CSC420")
    assert codes(c, "blocking") == []
    assert [(x["number"], x["parent"], x["text"]) for x in c.questions[:3]] == [
        ("Q1", None, "True or false?"), ("Q1a", "Q1", "First statement."), ("Q1b", "Q1", "Second statement.")]
    with pytest.raises(ValueError):
        apply_review(ex, {"renumber": ["Q1a"]})


def test_paper_title_must_match_the_course_code_reuse():
    from past_validate import title_similarity

    pairs = [  # printed title on our real papers vs the course title: all the same course
        ("Ethical and Legal Issues in Computing (2 Units)", "Ethics and Legal Issues for CSC and Software Engineering"),
        ("Database Management II (2 Units)", "Data Management II"),
        ("Advances in Web, Mobile and AI Engineering", "Advances in Web, Mobile and Blockchain Development"),
        ("PROJECT MANAGEMENT", "Project Management"),
    ]
    assert all(title_similarity(a, b) >= 0.6 for a, b in pairs)
    assert title_similarity("Entertainment Media", "Media Law and Policy") < 0.6
    ex = {"paper": {**paper(code="ISM 413"), "title_on_paper": "ISM 413: Entertainment Media"}, "questions": [q("Q1", marks=5)]}
    c = check(ex, course_code="ISM413", course_title="Media Law and Policy")
    assert codes(c, "blocking") == ["title_mismatch"]
    assert check(ex, course_code="ISM413", course_title="Media Law and Policy", accepted={"title_mismatch"}).status == "ok"


def test_orientation_turns_only_when_the_turn_reads_clearly_better(monkeypatch):
    import orientation as o

    words = {}
    monkeypatch.setattr(o, "turn", lambda image, r: f"{image.decode()}@{r}".encode())
    monkeypatch.setattr(o, "clear_words", lambda image: words.get(image.decode(), 0))
    # Tesseract says 180°, but the page reads far better as it is (handwriting fooled it): leave it.
    monkeypatch.setattr(o, "suggest", lambda image: 180)
    words.update({"a": 200, "a@180": 5})
    r = o.check(b"a")
    assert not r.applied and r.rotate == 180
    # Sideways and unreadable as it is: the suggested quarter turn makes it readable → turned.
    monkeypatch.setattr(o, "suggest", lambda image: 270)
    words.update({"b": 0, "b@270": 160, "b@90": 3})
    assert o.check(b"b") == o.Orientation(270, True, 0, 160)
    # No suggestion but the page reads poorly: every quarter turn is tried, the best one wins.
    monkeypatch.setattr(o, "suggest", lambda image: 0)
    words.update({"c": 2, "c@90": 120})
    assert o.check(b"c").applied and o.check(b"c").rotate == 90
    # Reads poorly every way (small print): left as is.
    words.update({"d": 4})
    assert not o.check(b"d").applied


def test_render_pages_turns_a_sideways_scan_upright(tmp_path: Path, monkeypatch):
    import past_papers

    monkeypatch.setattr(past_papers, "ORIENTATION_CACHE", tmp_path / "cache")
    monkeypatch.setattr(past_papers.orientation, "check", lambda image: past_papers.orientation.Orientation(90, True, 0, 100))
    pdf = tmp_path / "scan.pdf"
    doc = pymupdf.open()
    doc.new_page(width=842, height=595)  # landscape, no text layer: like a sideways phone photo
    doc.save(pdf)
    jpeg, text, note = past_papers.render_pages(pdf)[0]
    from PIL import Image
    import io
    w, h = Image.open(io.BytesIO(jpeg)).size
    assert h > w and note.startswith("turned 90°")
    assert (tmp_path / "cache").is_dir()  # cached per file: re-runs don't call Tesseract again


def test_owner_note_reaches_the_prompt_but_review_notes_do_not(tmp_path: Path):
    from manifest import PastPaper
    from past_papers import build_params

    class C:
        institution, code, title, aliases = "pau", "ECO405", "Development Planning", ()

    pages = [(b"\xff\xd8x", "", "upright")]
    kw = dict(file=tmp_path / "p.pdf", rel_file="x/p.pdf", session="2021/2022", type="test", code_on_paper=None, scanned=False)
    note = "Typed paper with some answers filled in (unverified). Use the questions only."
    prompt = build_params(C, PastPaper(**kw, note=note), pages)["messages"][0]["content"][-1]["text"]
    assert f"Note from the course owner about this file: {note}" in prompt
    prompt = build_params(C, PastPaper(**kw, note="review: guessed from the folder"), pages)["messages"][0]["content"][-1]["text"]
    assert "Note from the course owner" not in prompt
