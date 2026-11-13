"""Past questions, analysis step (PRD §9.4 steps 4–5): retrieve slides, tag topics, judge relevance to
this year's slides, write one model answer + marking scheme per question (PAST_ANSWER_MODEL).

Answer design v2 (every course, CS included):
- Retrieval: the whole course first to find the question's topic, then that topic, merged topic-first.
- Nothing relevant (best similarity under NO_MATCH_SIMILARITY, the chat's own cut-off): no slides are
  sent and the answer is general, inside <general>. The model also judges whether the slides it got
  really cover the question (relevance). Grounding = slides | partial | general follows from
  relevance (supabase migration 20261113000003): no slides → not_covered; "covered" without one
  slide citation → partial.
- Calculations: numbered steps with the working. MCQs: the key is stored and attempts are marked in
  code (no model call).
- New slides: --recheck re-retrieves partial/general answers and regenerates those whose search now
  finds slides they didn't have.

Only entries a student practises get a request: questions without parts, and parts. A question that
has parts takes its topics (union) and relevance (best) from them.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import batch
from config import PAST_ANSWER_MODEL
from embed import embed_documents, embed_query
from store import vector_literal

ANALYSE_VERSION = "2"
SLIDES_PER_QUESTION = 8
TOPIC_SLIDES = 6  # from the question's topic, ahead of the course-wide results
NO_MATCH_SIMILARITY = 0.3  # same cut-off as chat (apps/web/lib/agent/tools.ts NO_MATCH_SIMILARITY)
GENERAL_LABEL = "Not from your slides. Either this topic hasn't been uploaded yet, or it isn't in this year's slides."
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

2. relevance: do the slides given here actually teach what this question needs? Judge the content, not shared words.
   - covered: the slides teach what is needed for full marks.
   - partial: they teach some of it; a student would need more.
   - not_covered: they don't teach it, or no slides were given.
   relevance_note: one short sentence saying why.

3. model_answer: one strong answer a student could write in the exam, in Markdown.
   - Size it to the marks: about one developed point per 2 marks (6 marks ≈ 3 developed points, 10 marks ≈ 5), following the command word (define, describe, explain, compare, calculate, sketch…). Use short headings or a numbered list when the question has several parts (i, ii, …).
   - Calculations: numbered steps ("Step 1", "Step 2", …), each with the formula used, the numbers put in and the result, then the final answer in bold with its unit. Code or SQL: a code block. "Draw/sketch": describe the diagram clearly or give a simple text diagram, with every label the question asks for.
   - Citations: every sentence that comes from the slides ends with [[s:SLIDE_KEY]], using only keys of the slides given here, exactly as written.
   - Anything not from the slides (standard knowledge needed for full marks, worked numbers, an example) goes inside a <general> block on its own lines:
     <general>
     ...
     </general>
   - When relevance is not_covered, the whole answer goes in one <general> block (a correct, exam-standard answer from general knowledge).
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


def load_jobs(store, course_id: str, force: bool = False, recheck: bool = False) -> list[QuestionJob]:
    """Questions to answer: unanswered ones (all with force). recheck: only partial/general answers."""
    rows = store.db.execute(
        """select q.id, q.course_id, q.number, q.parent_id, q.text, q.marks, q.type, q.options, q.model_answer,
                  q.relevance, p.session, p.type as paper_type, p.status
           from past_questions q join past_papers p on p.id = q.paper_id
           where q.course_id = %s order by p.session, p.source_file, q.sort_order""",
        (course_id,),
    ).fetchall()
    by_id = {str(r["id"]): r for r in rows}
    has_parts = {str(r["parent_id"]) for r in rows if r["parent_id"]}
    jobs = []
    for r in rows:
        if str(r["id"]) in has_parts or r["status"] != "ok":
            continue
        if recheck:
            if not r["model_answer"] or r["relevance"] not in ("partial", "not_covered"):
                continue
        elif r["model_answer"] and not force:
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


_MATCH = """select slide_id, slide_key, material_title, material_kind, topic_id, topic_title, slide_number, title, chunk_text,
                  similarity, score
           from match_slides(%s, %s::extensions.vector, %s, %s, %s)"""


def retrieve(store, job: QuestionJob) -> None:
    """Same hybrid search as chat (match_slides), query = stem + question. Topic first: the whole
    course finds the question's topic (most search weight), that topic is searched on its own, and
    its slides lead, followed by the rest of the course's. No slide at or above NO_MATCH_SIMILARITY
    → nothing is sent and the answer is general."""
    stem = " ".join(job.context)[-600:]
    job.query = f"{stem}\n{job.text}".strip()
    vec = vector_literal(embed_query(job.query[:4000]))
    course = store.db.execute(_MATCH, (job.course_id, vec, job.query[:2000], SLIDES_PER_QUESTION, None)).fetchall()
    weight: dict[str, float] = {}
    for s in course:
        if s["topic_id"]:
            weight[str(s["topic_id"])] = weight.get(str(s["topic_id"]), 0.0) + float(s["score"] or 0)
    topic = max(weight, key=weight.get) if weight else None
    in_topic = store.db.execute(_MATCH, (job.course_id, vec, job.query[:2000], TOPIC_SLIDES, topic)).fetchall() if topic else []
    merged, seen = [], set()
    for s in [*in_topic, *course]:
        if s["slide_id"] not in seen:
            seen.add(s["slide_id"])
            merged.append(s)
    best = max((float(s["similarity"]) for s in merged if s["similarity"] is not None), default=0.0)
    job.slides = merged[:SLIDES_PER_QUESTION] if best >= NO_MATCH_SIMILARITY else []


def has_new_slides(store, job: QuestionJob) -> bool:
    """--recheck: does the search now find slides this answer wasn't written from?"""
    old = {str(r["slide_id"]) for r in store.db.execute("select slide_id from question_slides where question_id = %s", (job.id,)).fetchall()}
    return any(str(s["slide_id"]) not in old for s in job.slides)


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
        "model": PAST_ANSWER_MODEL,
        "max_tokens": 8000,
        "system": [{"type": "text", "text": INSTRUCTIONS, "cache_control": {"type": "ephemeral"}}],
        **model_options(PAST_ANSWER_MODEL),
        "output_config": {**model_options(PAST_ANSWER_MODEL).get("output_config", {}),
                          "format": {"type": "json_schema", "schema": ANALYSE_SCHEMA}},
        "messages": [{"role": "user", "content": (
            f"Course: {course.code} {course.title}\n\nTopics:\n{topic_list}\n\n<slides>\n{slides}\n</slides>\n\n{question}"
        )}],
    }


def model_options(model: str) -> dict:
    """Haiku answers from the retrieved slides without extended thinking (cost plan C); Sonnet keeps
    medium effort."""
    return {"thinking": {"type": "disabled"}} if "haiku" in model else {"output_config": {"effort": "medium"}}


def course_topics(store, course_id: str) -> list[dict]:
    return store.db.execute("select id, topic_order, title from topics where course_id = %s order by topic_order", (course_id,)).fetchall()


@dataclass
class Analysed:
    topics: list[str]  # topic ids
    relevance: str  # decides grounding: covered → slides, partial → partial, not_covered → general
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
    relevance = raw["relevance"]
    if not job.slides:
        relevance = "not_covered"  # nothing passed the search cut-off
    elif relevance == "covered" and not CITE_RE.search(answer):
        relevance = "partial"
        problems.append("covered but cites no slide: stored as partial")
    if relevance == "not_covered" and "<general>" not in answer:
        answer = f"<general>\n{answer}\n</general>"
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
    return Analysed(topic_ids, relevance, answer, scheme, key, keep(raw.get("explanation")) if job.type == "mcq" else None, problems)


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
    # A stem can't be a multiple-choice question itself (it has no options): its parts are.
    store.db.execute(
        """update past_questions q set type = (
             select case when m = 'mcq' and q.options is null then 'explain' else m end
             from (select mode() within group (order by c.type) as m from past_questions c where c.parent_id = q.id) x)
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


def grounding(relevance: str | None) -> str | None:
    return {"covered": "slides", "partial": "partial", "not_covered": "general"}.get(relevance or "")


def estimate_tokens(jobs: list[QuestionJob]) -> tuple[int, int]:
    """Exact input tokens (count_tokens is free) and an output guess (answer + scheme; no thinking on Haiku)."""
    tin = sum(batch.count_input_tokens(j.params) for j in jobs)  # type: ignore[arg-type]
    tout = sum(400 + int(120 * (j.marks or 5)) for j in jobs)
    return tin, tout


# ── reuse across programmes (SEN's copies of CS papers) ─────
def reuse_answer(store, job: QuestionJob) -> dict | None:
    """The answer of the same question in a byte-identical paper of another course, when every slide it
    cites has the same text in this course (slide keys are positions, so they're compared by content).
    Returns the source row (relevance, answer, scheme, key, explanation, topic titles) or None."""
    src = store.db.execute(
        """select sq.id, sq.course_id, sq.relevance, sq.model_answer, sq.marking_scheme, sq.answer_key, sq.answer_explanation
           from past_questions q join past_papers p on p.id = q.paper_id
           join past_papers sp on sp.file_hash = p.file_hash and sp.course_id <> p.course_id
           join past_questions sq on sq.paper_id = sp.id and sq.number = q.number
           where q.id = %s and sq.model_answer is not null and sq.relevance is not null
           order by sp.created_at limit 1""",
        (job.id,),
    ).fetchone()
    if not src:
        return None
    for key in set(CITE_RE.findall(src["model_answer"] or "") + CITE_RE.findall(src["answer_explanation"] or "")):
        a = store.db.execute("select chunk_text from slides where course_id = %s and slide_key = %s", (src["course_id"], key)).fetchone()
        b = store.db.execute("select chunk_text from slides where course_id = %s and slide_key = %s", (job.course_id, key)).fetchone()
        if not a or not b or a["chunk_text"] != b["chunk_text"]:
            return None
    topics = store.db.execute(
        "select t.title from question_topics qt join topics t on t.id = qt.topic_id where qt.question_id = %s", (src["id"],)
    ).fetchall()
    return {**src, "topic_titles": [t["title"] for t in topics]}


def save_reused(store, job: QuestionJob, src: dict, topics: list[dict]) -> None:
    """Copy an answer (reuse_answer); topics are matched by title in this course, slides by key."""
    by_title = {t["title"].strip().lower(): str(t["id"]) for t in topics}
    topic_ids = [by_title[t.strip().lower()] for t in src["topic_titles"] if t.strip().lower() in by_title]
    a = Analysed(topic_ids, src["relevance"], src["model_answer"], src["marking_scheme"] or [], src["answer_key"],
                 src["answer_explanation"], [])
    save(store, job, a)


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
        "model": PAST_ANSWER_MODEL,
        "max_tokens": 4000,
        **model_options(PAST_ANSWER_MODEL),
        "output_config": {**model_options(PAST_ANSWER_MODEL).get("output_config", {}),
                          "format": {"type": "json_schema", "schema": REPEATS_SCHEMA}},
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
