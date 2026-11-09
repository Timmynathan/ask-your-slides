"""Past questions, analysis step (PRD §9.4 steps 4–5): retrieve slides, tag topics, judge relevance to
this year's slides, write one model answer + marking scheme per question.

Only entries a student practises get a request: questions without parts, and parts. A question that
has parts takes its topics (union) and relevance (best) from them.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import batch
from config import PAST_Q_MODEL
from embed import embed_documents, embed_query
from store import vector_literal

ANALYSE_VERSION = "1"
SLIDES_PER_QUESTION = 8
SLIDE_CHARS = 1400
RELEVANCE_RANK = {"covered": 2, "partial": 1, "not_covered": 0}
CITE_RE = re.compile(r"\[\[s:([A-Za-z0-9-]+)\]\]")

ANALYSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["topics", "relevance", "relevance_note", "model_answer", "marking_scheme", "answer_key", "explanation"],
    "properties": {
        "topics": {"type": "array", "items": {"type": "integer"}},
        "relevance": {"type": "string", "enum": ["covered", "partial", "not_covered"]},
        "relevance_note": {"type": "string"},
        "model_answer": {"type": "string"},
        "marking_scheme": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["point", "marks"],
                "properties": {"point": {"type": "string"}, "marks": {"type": "number"}},
            },
        },
        "answer_key": {"type": ["string", "null"]},
        "explanation": {"type": ["string", "null"]},
    },
}

INSTRUCTIONS = """You prepare exam practice for final-year students at Pan-Atlantic University (PAU). You get one past exam question, the course's topics, and the lecture slides from this year's course that a search found for the question. Return:

1. topics: the order numbers of the 1–3 course topics the question examines, most relevant first. Use the slides' topics as evidence, but judge by what the question asks.

2. relevance: how well this year's slides (the ones given) teach what the question needs.
   - covered: the slides teach what is needed for full marks.
   - partial: they teach some of it; a student would need more.
   - not_covered: they don't teach it (for example the topic is no longer in the course).
   relevance_note: one short sentence saying why.

3. model_answer: one strong answer a student could write in the exam, in Markdown.
   - Size it to the marks: about one developed point per 2 marks (6 marks ≈ 3 developed points, 10 marks ≈ 5), following the command word (define, describe, explain, compare, calculate, sketch…). Use short headings or a numbered list when the question has several parts (i, ii, …).
   - Calculations: show the formula, the working and the final values. Code or SQL: a code block. "Draw/sketch": describe the diagram clearly or give a simple text diagram, with every label the question asks for.
   - Citations: every sentence that comes from the slides ends with [[s:SLIDE_KEY]], using only keys of the slides given here, exactly as written.
   - Anything not from the slides (standard knowledge needed for full marks, worked numbers, an example) goes inside a <general> block on its own lines:
     <general>
     ...
     </general>
   - Write it as the answer itself. Never mention searching, "the slides provided", or what was found.

4. marking_scheme: the points an examiner would award, each with its marks, adding up exactly to the question's marks.

5. answer_key and explanation: for a multiple-choice question, the label of the correct option and one sentence explaining it (with a [[s:SLIDE_KEY]] citation if a slide supports it). null for every other type; for those, model_answer carries the answer."""


@dataclass
class QuestionJob:
    id: str
    course_id: str
    number: str
    text: str
    marks: float | None
    type: str
    options: list | None
    context: list[str]  # stems of enclosing questions, outermost first
    paper: str  # e.g. "2025/2026 exam"
    query: str = ""
    slides: list[dict] = field(default_factory=list)
    params: dict | None = None

    @property
    def custom_id(self) -> str:
        return f"q-{self.id}"


def load_jobs(store, course_id: str, force: bool = False) -> list[QuestionJob]:
    rows = store.db.execute(
        """select q.id, q.course_id, q.number, q.parent_id, q.text, q.marks, q.type, q.options, q.model_answer,
                  p.session, p.type as paper_type, p.status
           from past_questions q join past_papers p on p.id = q.paper_id
           where q.course_id = %s order by p.session, p.source_file, q.sort_order""",
        (course_id,),
    ).fetchall()
    by_id = {str(r["id"]): r for r in rows}
    has_parts = {str(r["parent_id"]) for r in rows if r["parent_id"]}
    jobs = []
    for r in rows:
        if str(r["id"]) in has_parts or r["status"] != "ok" or (r["model_answer"] and not force):
            continue
        context, p = [], r["parent_id"]
        while p:
            parent = by_id[str(p)]
            if (parent["text"] or "").strip():
                context.insert(0, parent["text"].strip())
            p = parent["parent_id"]
        jobs.append(QuestionJob(
            id=str(r["id"]), course_id=str(r["course_id"]), number=r["number"], text=r["text"],
            marks=float(r["marks"]) if r["marks"] is not None else None, type=r["type"], options=r["options"],
            context=context, paper=f"{r['session']} {r['paper_type']}",
        ))
    return jobs


def retrieve(store, job: QuestionJob) -> None:
    """Same hybrid search as chat (match_slides), whole course, query = stem + question."""
    stem = " ".join(job.context)[-600:]
    job.query = f"{stem}\n{job.text}".strip()
    vec = embed_query(job.query[:4000])
    job.slides = store.db.execute(
        """select slide_id, slide_key, material_title, material_kind, topic_title, slide_number, title, chunk_text, similarity
           from match_slides(%s, %s::extensions.vector, %s, %s)""",
        (job.course_id, vector_literal(vec), job.query[:2000], SLIDES_PER_QUESTION),
    ).fetchall()


def build_params(course, topics: list[dict], job: QuestionJob) -> dict:
    topic_list = "\n".join(f"{t['topic_order']}. {t['title']}" for t in topics)
    slides = "\n\n".join(
        f"<slide key=\"{s['slide_key']}\" topic=\"{s['topic_title'] or 'course-level'}\" material=\"{s['material_title']}\" "
        f"kind=\"{s['material_kind']}\">\n{(s['chunk_text'] or '')[:SLIDE_CHARS]}\n</slide>"
        for s in job.slides
    ) or "(no slides matched)"
    context = "\n\n".join(job.context)
    options = "\n".join(f"{o['label']}. {o['text']}" for o in job.options or [])
    question = "\n".join(x for x in [
        f"Paper: {job.paper} · {job.number} · {f'{job.marks:g} marks' if job.marks is not None else 'marks not printed'} · type: {job.type}",
        f"Context (the question's stem):\n{context}" if context else "",
        f"Question:\n{job.text}",
        f"Options:\n{options}" if options else "",
    ] if x)
    return {
        "model": PAST_Q_MODEL,
        "max_tokens": 16000,
        "system": [{"type": "text", "text": INSTRUCTIONS, "cache_control": {"type": "ephemeral"}}],
        "output_config": {"effort": "medium", "format": {"type": "json_schema", "schema": ANALYSE_SCHEMA}},
        "messages": [{"role": "user", "content": (
            f"Course: {course.code} {course.title}\n\nTopics:\n{topic_list}\n\n<slides>\n{slides}\n</slides>\n\n{question}"
        )}],
    }


def course_topics(store, course_id: str) -> list[dict]:
    return store.db.execute("select id, topic_order, title from topics where course_id = %s order by topic_order", (course_id,)).fetchall()


@dataclass
class Analysed:
    topics: list[str]  # topic ids
    relevance: str
    model_answer: str
    marking_scheme: list[dict]
    answer_key: str | None
    explanation: str | None
    problems: list[str]


def check_analysis(raw: dict, job: QuestionJob, topics: list[dict]) -> Analysed:
    problems: list[str] = []
    by_order = {t["topic_order"]: str(t["id"]) for t in topics}
    topic_ids = [by_order[o] for o in raw["topics"] if o in by_order][:3]
    if len(topic_ids) != len(raw["topics"][:3]):
        problems.append(f"unknown topic number(s) {[o for o in raw['topics'] if o not in by_order]}")
    if not topic_ids:
        problems.append("no topic")
    allowed = {s["slide_key"] for s in job.slides}

    def keep(text: str | None) -> str | None:
        if text is None:
            return None
        bad = [k for k in CITE_RE.findall(text) if k not in allowed]
        for k in bad:
            text = text.replace(f"[[s:{k}]]", "")
        if bad:
            problems.append(f"dropped citation(s) to slides not given: {sorted(set(bad))}")
        return text.strip()

    answer = keep(raw["model_answer"]) or ""
    scheme = [p for p in raw["marking_scheme"] if p.get("point")]
    if job.marks is not None and scheme and abs(sum(float(p["marks"]) for p in scheme) - job.marks) > 0.01:
        problems.append(f"marking scheme adds up to {sum(float(p['marks']) for p in scheme):g}, not {job.marks:g}")
    key = raw.get("answer_key")
    if job.type == "mcq":
        labels = {str(o["label"]).strip().upper() for o in job.options or []}
        if not key or key.strip().upper() not in labels:
            problems.append(f"MCQ answer key {key!r} is not one of {sorted(labels)}")
    else:
        key = None
    return Analysed(topic_ids, raw["relevance"], answer, scheme, key, keep(raw.get("explanation")) if job.type == "mcq" else None, problems)


def save(store, job: QuestionJob, a: Analysed) -> None:
    emb = embed_documents([job.query[:4000]])[0]
    with store.db.transaction():
        store.db.execute(
            """update past_questions set relevance = %s, model_answer = %s, marking_scheme = %s, answer_key = %s,
                 answer_explanation = %s, embedding = %s::extensions.vector where id = %s""",
            (a.relevance, a.model_answer, json.dumps(a.marking_scheme), a.answer_key, a.explanation, vector_literal(emb), job.id),
        )
        store.db.execute("delete from question_topics where question_id = %s", (job.id,))
        for t in a.topics:
            store.db.execute("insert into question_topics values (%s, %s) on conflict do nothing", (job.id, t))
        store.db.execute("delete from question_slides where question_id = %s", (job.id,))
        for rank, s in enumerate(job.slides, 1):
            store.db.execute("insert into question_slides values (%s, %s, %s)", (job.id, s["slide_id"], rank))


def roll_up(store, course_id: str) -> None:
    """Questions with parts: topics = union of their parts', relevance = best of their parts', type = their
    parts' most common type (a stem is not itself an essay question)."""
    store.db.execute(
        """with recursive parents as (
             select distinct parent_id as id from past_questions where course_id = %s and parent_id is not null)
           update past_questions q set relevance = (
             select case max(case c.relevance when 'covered' then 2 when 'partial' then 1 when 'not_covered' then 0 end)
                      when 2 then 'covered' when 1 then 'partial' when 0 then 'not_covered' end
             from past_questions c where c.parent_id = q.id)
           where q.id in (select id from parents)""",
        (course_id,),
    )
    store.db.execute(
        """update past_questions q set type = (
             select mode() within group (order by c.type) from past_questions c where c.parent_id = q.id)
           where q.course_id = %s and exists (select 1 from past_questions c where c.parent_id = q.id)""",
        (course_id,),
    )
    store.db.execute(
        """insert into question_topics (question_id, topic_id)
           select distinct c.parent_id, t.topic_id from past_questions c join question_topics t on t.question_id = c.id
           where c.course_id = %s and c.parent_id is not null
           on conflict do nothing""",
        (course_id,),
    )


def estimate_tokens(jobs: list[QuestionJob]) -> tuple[int, int]:
    """Exact input tokens (count_tokens is free) and an output guess (answer + scheme + thinking)."""
    tin = sum(batch.count_input_tokens(j.params) for j in jobs)  # type: ignore[arg-type]
    tout = sum(900 + int(120 * (j.marks or 5)) + 1500 for j in jobs)
    return tin, tout


# ── repeats (PRD §9.4 step 6) ──────────────────────────────
REPEAT_SIMILARITY = 0.75  # candidate pairs; the model confirms each one

REPEATS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["same"],
    "properties": {"same": {"type": "array", "items": {"type": "integer"}}},
}


def repeat_candidates(store, course_id: str) -> list[dict]:
    """Pairs of practised questions from different papers of a course whose embeddings are close."""
    return store.db.execute(
        """select a.id as a_id, b.id as b_id, a.text as a_text, b.text as b_text, pa.session as a_session, pb.session as b_session,
                  pa.type as a_type, pb.type as b_type, a.number as a_number, b.number as b_number,
                  1 - (a.embedding <=> b.embedding) as similarity
           from past_questions a join past_questions b on a.course_id = b.course_id and a.id < b.id and a.paper_id <> b.paper_id
           join past_papers pa on pa.id = a.paper_id join past_papers pb on pb.id = b.paper_id
           where a.course_id = %s and a.embedding is not null and b.embedding is not null
             and 1 - (a.embedding <=> b.embedding) >= %s
           order by similarity desc limit 60""",
        (course_id, REPEAT_SIMILARITY),
    ).fetchall()


def repeat_params(course, pairs: list[dict]) -> dict:
    listing = "\n\n".join(
        f"Pair {i}:\nA ({p['a_session']} {p['a_type']} {p['a_number']}): {p['a_text'][:700]}\n"
        f"B ({p['b_session']} {p['b_type']} {p['b_number']}): {p['b_text'][:700]}"
        for i, p in enumerate(pairs, 1)
    )
    return {
        "model": PAST_Q_MODEL,
        "max_tokens": 4000,
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": REPEATS_SCHEMA}},
        "messages": [{"role": "user", "content": (
            f"These are pairs of past exam questions from {course.code} {course.title}, from different papers. "
            "A pair is a repeat when both ask the student for the same idea or skill, even if worded differently or with "
            "different numbers or scenario (e.g. both ask to explain B+ tree indexes, or both ask to normalise a table to 3NF). "
            "Questions that only share a topic but ask for different things are not repeats.\n\n"
            f"{listing}\n\nReturn the pair numbers that are repeats."
        )}],
    }


def save_repeats(store, course_id: str, pairs: list[dict], same: list[int]) -> int:
    """Group confirmed pairs (connected components) under one repeat_group id each."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.setdefault(x, x) != x:
            x = parent[x]
        return x

    for i in same:
        if 1 <= i <= len(pairs):
            a, b = str(pairs[i - 1]["a_id"]), str(pairs[i - 1]["b_id"])
            parent[find(a)] = find(b)
    groups: dict[str, list[str]] = {}
    for x in list(parent):
        groups.setdefault(find(x), []).append(x)
    with store.db.transaction():
        store.db.execute("update past_questions set repeat_group = null where course_id = %s", (course_id,))
        for members in groups.values():
            gid = store.db.execute("select gen_random_uuid() as id").fetchone()["id"]
            store.db.execute("update past_questions set repeat_group = %s where id = any(%s::uuid[])", (gid, members))
    return len(groups)
