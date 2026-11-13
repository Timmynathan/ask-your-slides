"""Answer design v2 (PRD F10): topic-first retrieval, the "nothing relevant" cut-off, grounding from
relevance, general answers wrapped and labelled, Haiku without thinking, and the recheck rule."""

from __future__ import annotations

import past_analysis as pa


def job(**kw):
    base = dict(id="q1", course_id="c1", number="Q1", text="Explain normalisation.", marks=6.0, type="explain",
                options=None, context=[], paper="2025/2026 exam")
    return pa.QuestionJob(**{**base, **kw})


TOPICS = [{"id": "t1", "topic_order": 1, "title": "Normalisation"}, {"id": "t2", "topic_order": 2, "title": "Indexing"}]


def raw(**kw):
    return {"topics": [1], "relevance": "covered", "relevance_note": "", "model_answer": "1NF removes repeating groups [[s:K1]].",
            "marking_scheme": [{"point": "1NF", "marks": 6}], "answer_key": None, "explanation": None, **kw}


class FakeDB:
    """match_slides stand-in: course-wide results, and per-topic results."""

    def __init__(self, course, by_topic, linked=()):
        self.course, self.by_topic, self.linked, self.calls = course, by_topic, linked, []

    def execute(self, sql, params):
        self.calls.append(params)

        class R:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

        if "question_slides" in sql:
            return R([{"slide_id": s} for s in self.linked])
        topic = params[4]
        return R(self.by_topic.get(topic, []) if topic else self.course)


class FakeStore:
    def __init__(self, db):
        self.db = db


def slide(i, topic, sim, score=0.02):
    return {"slide_id": f"s{i}", "slide_key": f"K{i}", "material_title": "L", "material_kind": "slides", "topic_id": topic,
            "topic_title": topic, "slide_number": i, "title": "", "chunk_text": "x", "similarity": sim, "score": score}


def test_retrieval_is_topic_first_then_course(monkeypatch):
    monkeypatch.setattr(pa, "embed_query", lambda q: [0.0] * 4)
    monkeypatch.setattr(pa, "vector_literal", lambda v: "[0]")
    course = [slide(1, "t2", 0.5, 0.03), slide(2, "t1", 0.45, 0.02), slide(3, "t1", 0.4, 0.02)]
    db = FakeDB(course, {"t1": [slide(3, "t1", 0.4), slide(4, "t1", 0.35)]})
    j = job()
    pa.retrieve(FakeStore(db), j)
    # t1 has the most search weight (0.04 vs 0.03): its own search leads, then the course's, no duplicates.
    assert db.calls[1][4] == "t1"
    assert [s["slide_key"] for s in j.slides] == ["K3", "K4", "K1", "K2"]


def test_nothing_relevant_sends_no_slides(monkeypatch):
    monkeypatch.setattr(pa, "embed_query", lambda q: [0.0] * 4)
    monkeypatch.setattr(pa, "vector_literal", lambda v: "[0]")
    db = FakeDB([slide(1, "t1", 0.21), slide(2, None, None)], {"t1": [slide(1, "t1", 0.21)]})
    j = job()
    pa.retrieve(FakeStore(db), j)
    assert j.slides == []
    assert "(no slides matched)" in pa.build_params(type("C", (), {"code": "X", "title": "Y"}), TOPICS, j)["messages"][0]["content"]


def test_grounding_follows_relevance_with_the_safety_rules():
    j = job(slides=[slide(1, "t1", 0.6)])
    assert pa.grounding(pa.check_analysis(raw(), j, TOPICS).relevance) == "slides"
    # "covered" but no slide cited → partial
    a = pa.check_analysis(raw(model_answer="Normalisation reduces redundancy."), j, TOPICS)
    assert pa.grounding(a.relevance) == "partial" and a.problems
    # No slides at all → general, whatever the model says, and the answer sits in a <general> block.
    a = pa.check_analysis(raw(model_answer="Normalisation reduces redundancy."), job(slides=[]), TOPICS)
    assert pa.grounding(a.relevance) == "general" and a.model_answer.startswith("<general>")
    assert pa.grounding("partial") == "partial" and pa.grounding(None) is None


def test_haiku_runs_without_thinking_and_sonnet_keeps_effort():
    j = job(slides=[slide(1, "t1", 0.6)])
    p = pa.build_params(type("C", (), {"code": "X", "title": "Y"}), TOPICS, j)
    assert p["model"] == pa.PAST_ANSWER_MODEL
    if "haiku" in p["model"]:
        assert p["thinking"] == {"type": "disabled"} and "effort" not in p["output_config"]
    assert p["output_config"]["format"]["schema"] is pa.ANALYSE_SCHEMA
    assert pa.model_options("claude-sonnet-5-5") == {"output_config": {"effort": "medium"}}
    assert "Step 1" in pa.INSTRUCTIONS  # calculations: numbered steps with working


def test_recheck_only_when_the_search_finds_new_slides():
    j = job(slides=[slide(1, "t1", 0.6), slide(2, "t1", 0.5)])
    assert not pa.has_new_slides(FakeStore(FakeDB([], {}, linked=("s1", "s2"))), j)
    assert pa.has_new_slides(FakeStore(FakeDB([], {}, linked=("s1",))), j)
