"""Past papers → past_questions (PRD F10, §9.4).

    npm run ingest:past -- --estimate                       # cost estimate only, nothing sent
    npm run ingest:past -- --course INS401 --paper 2025-2026_exam
    npm run ingest:past -- --yes                            # skip the confirmation prompt
    npm run ingest:past -- --no-store                       # extract + report, don't write the DB

Steps (phase 1): render pages (scanned pages turned upright first, orientation.py) → extract with
PAST_Q_MODEL through the Message Batches API → apply the paper's review file → check (incl. the
paper's printed code and title against the course) → write the review report and the course-match
report → store (status ok | needs_review; only ok is shown to students).

A paper whose file is byte-identical to one already extracted for another course (Software
Engineering's copies of the CS papers) reuses that extraction: no model call. Identical files in
the same run are sent once: the first copy goes to the model, the others reuse its reply.

Hand-made extraction (optional, owner, Nov 2026), next to the paper: past_papers/<name>.extraction.json,
a JSON object matching EXTRACT_SCHEMA. When present it replaces the model (no API call): it is checked
against the schema, then reviewed, validated and stored like a model reply, with extraction_model
"manual". Identical copies of the paper in other programmes reuse it.

Idempotent: a paper whose file, prompt and review file are unchanged is skipped, whichever model
read it (switching PAST_Q_MODEL doesn't re-read stored papers; --force does). Every model reply is
cached in data/.cache/batches, so re-running after a fix only pays for what changed.

Review file (optional), next to the paper: past_papers/<name>.review.yaml

    accept: [subparts_sum:Q2, total_marks]   # a checked problem that is fine as printed
    paper: {total_marks: 70}                 # override a paper field
    questions: {Q2b: {marks: 6}}             # override fields of a question
    drop: [Q9]                               # remove a question that isn't one
    add: [{number: Q3c, parent: Q3, ...}]    # add a question the model missed
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from concurrent.futures import ThreadPoolExecutor

import batch
import orientation
import pymupdf
import yaml
from config import CACHE, DATA, PAST_ANSWER_MODEL, PAST_Q_MODEL, ROOT
from manifest import Course, ManifestError, PastPaper, load
from past_validate import CONFIDENCE, QUESTION_TYPES, Checked, apply_review, check, course_guessed, course_match, flag_reasons

PROMPT_VERSION = "2"  # bump only to re-extract every paper (a re-store replaces its questions)
LONG_EDGE = 1568  # Claude's vision input is downscaled beyond this; render at it so nothing is wasted
REPORTS = ROOT / "data" / ".reports"
FLAGGED = ROOT / "data" / "_reports" / "past-flagged.md"
INSTITUTION_NAMES = {"pau": "Pan-Atlantic University"}

EXTRACT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["paper", "questions", "page_notes"],
    "properties": {
        "paper": {
            "type": "object",
            "additionalProperties": False,
            "required": ["code_on_paper", "title_on_paper", "session_on_paper", "total_marks", "duration",
                         "instructions", "answer_total", "compulsory", "sections"],
            "properties": {
                "code_on_paper": {"type": ["string", "null"]},
                "title_on_paper": {"type": ["string", "null"]},
                "session_on_paper": {"type": ["string", "null"]},
                "total_marks": {"type": ["number", "null"]},
                "duration": {"type": ["string", "null"]},
                "instructions": {"type": ["string", "null"]},
                "answer_total": {"type": ["integer", "null"]},
                "compulsory": {"type": "array", "items": {"type": "string"}},
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["name", "instructions", "choose"],
                        "properties": {
                            "name": {"type": "string"},
                            "instructions": {"type": ["string", "null"]},
                            "choose": {"type": ["integer", "null"]},
                        },
                    },
                },
            },
        },
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["number", "parent", "section", "text", "marks", "type", "options", "confidence", "unreadable", "note"],
                "properties": {
                    "number": {"type": "string"},
                    "parent": {"type": ["string", "null"]},
                    "section": {"type": ["string", "null"]},
                    "text": {"type": "string"},
                    "marks": {"type": ["number", "null"]},
                    "type": {"type": "string", "enum": list(QUESTION_TYPES)},
                    "options": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["label", "text"],
                            "properties": {"label": {"type": "string"}, "text": {"type": "string"}},
                        },
                    },
                    "confidence": {"type": "string", "enum": list(CONFIDENCE)},
                    "unreadable": {"type": "boolean"},
                    "note": {"type": ["string", "null"]},
                },
            },
        },
        "page_notes": {"type": "array", "items": {"type": "string"}},
    },
}

EXTRACT_PROMPT = """You are transcribing a past {paper_type} paper from {institution} so students can practise with it.
Course: {code} {title}{older}.
The paper's listing says: session {session}{listed}.

The {n} page image(s) above are the paper, in order.{text_layer}{owner_note}

Return every question as structured data. Rules:

Numbering
- One entry per question and per part. Use "Q1", "Q2" for questions and "Q1a", "Q1b" for parts, whatever style the paper uses (1(a), "Question One", "1.", a list of numbered multiple-choice items: all become this form).
- Sub-parts (i), (ii), … get their own entry ("Q1a(i)", "Q1a(ii)") only when each has its own printed marks. When they share one mark allocation (e.g. "(9 marks)" for the whole list), keep them inside the part's text as a list ("i. Predictive life cycle", "ii. …"), so the part is practised as one question.
- parent: the number of the enclosing entry ("Q1" for "Q1a", "Q1a" for "Q1a(ii)"), null for top-level questions.
- section: the section letter ("A", "B", …) when the paper has sections, else null.

Text
- text: the entry's own words, verbatim. Do not correct, reword or summarise; only rejoin words split across lines.
- A question that has parts: its text is its stem only (the scenario, case study, table or instruction before the parts), or "" when there is none. Never repeat the stem inside the parts.
- Tables → Markdown tables. Code and SQL → fenced code blocks with the original indentation. Diagrams and figures → "[Diagram: …]" describing everything a student needs (labels, values, arrows). Equations → plain text or LaTeX.
- If any word or number cannot be read, write "[unreadable]" in its place, set unreadable to true, and never guess.

Marks
- marks: exactly as printed for that entry, else null. Never compute or invent marks.

Type (what kind of answer is expected)
- define: state a definition, meaning, or name/list terms.
- explain: describe how or why, outline, discuss briefly, draw/label a simple diagram.
- compare: differences, similarities, advantages vs disadvantages, contrast.
- calculate: numbers or working: compute, derive, trace an algorithm step by step, normalise, convert.
- code: write, complete, correct or trace code or SQL.
- case_study: apply ideas to the given scenario, organisation or dataset.
- mcq: multiple choice. Put the choices in options with the paper's labels ("A", "B", … or "a", "b", …). Do not answer it. options is [] for every other type.
- essay: a long open discussion ("critically discuss", "write an essay").

Confidence (per entry)
- high: every word and number is clearly legible. medium: a few words inferred from context. low: significant parts uncertain.
- note: anything a reviewer should know about this entry (e.g. "marks printed as 5 but parts add to 6"), else null.

Paper
- code_on_paper, title_on_paper, session_on_paper: as printed (null if absent).
- total_marks: as printed, else null. duration: as printed.
- instructions: the rubric for candidates, verbatim (e.g. "Answer Question ONE and any other three"), not the general exam rules.
- answer_total: how many top-level questions a candidate answers in total, if the rubric says so (e.g. "Question ONE and any other three" → 4), else null.
- compulsory: top-level questions that must be answered (e.g. ["Q1"]), else [].
- sections: each section with its own rubric and choose = how many of its questions to answer (null = all of them). [] when the paper has no sections.

If the document includes a marking guide, sample answers, model solutions or notes for examiners, leave them out of every question's text (students must not see them) and say what was left out in page_notes.
Ignore cover-page exam regulations, stamps, page numbers and logos. If a student's handwriting or marks are on the page, ignore them and mention it in page_notes. page_notes also lists anything else that affected reading the paper (a cut-off edge, a blurred area)."""


@dataclass
class Job:
    course: Course
    paper: PastPaper
    file_hash: str
    review: dict | None  # the paper's .review.yaml
    review_hash: str
    params: dict
    pages: int
    orientation: tuple[str, ...] = ()  # per page: "upright", "turned 90° (…)", …
    reuse: dict | None = None  # the stored extraction of a byte-identical paper (no model call)
    reuse_from: str | None = None  # that paper's course code
    reuse_model: str | None = None  # the model (or "manual") that extracted it
    copy_of: Job | None = None  # an identical file in this run that goes to the model instead
    manual: dict | None = None  # the paper's .extraction.json (replaces the model)
    manual_hash: str = ""
    manual_error: str | None = None  # the .extraction.json exists but doesn't match EXTRACT_SCHEMA

    @property
    def custom_id(self) -> str:
        return hashlib.sha256(self.paper.rel_file.encode()).hexdigest()[:40]

    @property
    def model(self) -> str:
        """What extracted this paper, as stored in past_papers.extraction_model."""
        if self.manual is not None:
            return "manual"
        if self.copy_of is not None:
            return self.copy_of.model
        return self.reuse_model or PAST_Q_MODEL

    @property
    def fingerprint(self) -> str:
        return self.fingerprint_for(self.model)

    def fingerprint_for(self, model: str) -> str:
        """The fingerprint this paper would have if `model` had read it (file, prompt and review unchanged)."""
        if self.manual is not None:
            return hashlib.sha256(f"{self.file_hash}|manual|{self.manual_hash}|{self.review_hash}".encode()).hexdigest()
        return hashlib.sha256(f"{self.file_hash}|{model}|{PROMPT_VERSION}|{self.review_hash}".encode()).hexdigest()

    @property
    def name(self) -> str:
        return f"{self.course.code} {Path(self.paper.rel_file).name}"


ORIENTATION_CACHE = CACHE / "orientation"


def _orientations(path: Path, file_hash: str) -> dict[int, dict]:
    """{page index: {rotate, applied, words_as_is, words_turned}} for scanned pages, cached per file."""
    cache = ORIENTATION_CACHE / f"{file_hash}.json"
    if cache.is_file():
        return {int(k): v for k, v in json.loads(cache.read_text()).items()}
    images: dict[int, bytes] = {}
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc):
            if len(page.get_text("text").strip()) > 40:
                continue  # a real text layer: the page is the right way up
            zoom = LONG_EDGE / max(page.rect.width, page.rect.height)
            images[i] = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY).tobytes("png")
    with ThreadPoolExecutor(8) as ex:
        found = dict(zip(images, ex.map(orientation.check, images.values())))
    out = {i: {"rotate": o.rotate, "applied": o.applied, "words_as_is": o.words_as_is, "words_turned": o.words_turned} for i, o in found.items()}
    ORIENTATION_CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(out))
    return out


def render_pages(path: Path, fix_orientation: bool = True) -> list[tuple[bytes, str, str]]:
    """[(jpeg, text layer, orientation note)] per page, long edge = LONG_EDGE px. JPEG keeps scanned
    pages small. Scanned pages Tesseract proves are sideways or upside down are turned upright first."""
    turns: dict[int, dict] = {}
    if fix_orientation and orientation.available():
        turns = _orientations(path, hashlib.sha256(path.read_bytes()).hexdigest())
    out = []
    with pymupdf.open(path) as doc:
        for i, page in enumerate(doc):
            t = turns.get(i)
            note = orientation.Orientation(t["rotate"], t["applied"], t["words_as_is"], t["words_turned"]).describe() if t else "upright"
            if t and t["applied"]:
                page.set_rotation((page.rotation + t["rotate"]) % 360)
            zoom = LONG_EDGE / max(page.rect.width, page.rect.height)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            out.append((pix.tobytes("jpeg", jpg_quality=88), page.get_text("text").strip(), note))
    return out


def build_params(course: Course, paper: PastPaper, pages: list[tuple]) -> dict:
    content: list[dict] = []
    for i, page in enumerate(pages, 1):
        content.append({"type": "text", "text": f"Page {i}:"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(page[0]).decode()}})
    layer = "\n\n".join(f"--- Page {i} ---\n{page[1]}" for i, page in enumerate(pages, 1) if len(page[1]) > 40)
    text_layer = (
        f"\n\nThe PDF also has a text layer (use it to read words exactly, but trust the images for layout, tables and anything missing):\n<text_layer>\n{layer}\n</text_layer>"
        if layer else ""
    )
    listed = "".join([
        f", type {paper.type}",
        f", code on paper {paper.code_on_paper}" if paper.code_on_paper else "",
        f", instructions \"{paper.instructions}\"" if paper.instructions else "",
        f", duration {paper.duration}" if paper.duration else "",
    ])
    content.append({"type": "text", "text": EXTRACT_PROMPT.format(
        paper_type=paper.type, institution=INSTITUTION_NAMES.get(course.institution, course.institution.upper()),
        code=course.code, title=course.title,
        older=f" (older codes: {', '.join(course.aliases)})" if course.aliases else "",
        session=paper.session, listed=listed, n=len(pages), text_layer=text_layer,
        # e.g. "Typed paper with some answers filled in (unverified). Use the questions only."
        owner_note=f"\n\nNote from the course owner about this file: {paper.note}" if paper.note and not paper.note.startswith("review:") else "",
    )})
    return {
        "model": PAST_Q_MODEL,
        "max_tokens": 32000,
        "output_config": {"effort": "medium", "format": {"type": "json_schema", "schema": EXTRACT_SCHEMA}},
        "messages": [{"role": "user", "content": content}],
    }


def review_path(paper: PastPaper) -> Path:
    return paper.file.with_name(paper.file.stem + ".review.yaml")


def extraction_path(paper: PastPaper) -> Path:
    return paper.file.with_name(paper.file.stem + ".extraction.json")


_JSON_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def schema_errors(value, schema: dict, path: str = "$") -> list[str]:
    """Where `value` breaks `schema` (the subset EXTRACT_SCHEMA uses: type, enum, required,
    properties, additionalProperties: false, items). Empty = valid."""
    types = schema.get("type") or []
    types = [types] if isinstance(types, str) else types

    def is_type(t: str) -> bool:
        if t in ("integer", "number"):
            return isinstance(value, (int, float) if t == "number" else int) and not isinstance(value, bool)
        return isinstance(value, _JSON_TYPES[t])

    if types and not any(is_type(t) for t in types):
        return [f"{path}: expected {' or '.join(types)}, got {json.dumps(value)[:40]}"]
    errs = []
    if "enum" in schema and value not in schema["enum"]:
        errs.append(f"{path}: {value!r} is not one of {', '.join(schema['enum'])}")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        errs += [f"{path}: missing {k!r}" for k in schema.get("required", []) if k not in value]
        if schema.get("additionalProperties") is False:
            errs += [f"{path}: unknown field {k!r}" for k in value if k not in props]
        for k, v in value.items():
            if k in props:
                errs += schema_errors(v, props[k], f"{path}.{k}")
    if isinstance(value, list) and "items" in schema:
        for i, v in enumerate(value):
            errs += schema_errors(v, schema["items"], f"{path}[{i}]")
    return errs


def load_manual(paper: PastPaper) -> tuple[dict | None, str, str | None]:
    """The paper's hand-made .extraction.json → (extraction, file hash, error). (None, "", None) if there is none."""
    path = extraction_path(paper)
    if not path.is_file():
        return None, "", None
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        return None, digest, f"{path.name} is not valid JSON: {e}"
    errs = schema_errors(data, EXTRACT_SCHEMA)
    if errs:
        more = f" (+{len(errs) - 5} more)" if len(errs) > 5 else ""
        return None, digest, f"{path.name} doesn't match EXTRACT_SCHEMA: {'; '.join(errs[:5])}{more}"
    return data, digest, None


def make_job(course: Course, paper: PastPaper) -> Job:
    if paper.file.suffix.lower() != ".pdf":
        raise SystemExit(f"{paper.rel_file}: only PDF past papers are supported")
    raw = paper.file.read_bytes()
    rpath = review_path(paper)
    review_bytes = rpath.read_bytes() if rpath.is_file() else b""
    review = yaml.safe_load(review_bytes) if review_bytes else None
    pages = render_pages(paper.file)
    manual, manual_hash, manual_error = load_manual(paper)
    return Job(course, paper, hashlib.sha256(raw).hexdigest(), review, hashlib.sha256(review_bytes).hexdigest(),
               build_params(course, paper, pages), len(pages), orientation=tuple(p[2] for p in pages),
               manual=manual, manual_hash=manual_hash, manual_error=manual_error)


def group_identical(jobs: list[Job]) -> list[Job]:
    """One model request per file: marks every later job with the same file_hash as a copy of the
    first (a hand-made extraction wins over a model request). Returns the copies; each has copy_of
    set, reuse_from = the first's course code, and the first's review file if it has none."""
    first: dict[str, Job] = {}
    for j in sorted(jobs, key=lambda j: j.manual is None):  # stable: hand-made first, then run order
        if j.file_hash in first:
            src = j.copy_of = first[j.file_hash]
            j.reuse_from = src.course.code
            if j.review is None and src.review:
                j.review = src.review
        else:
            first[j.file_hash] = j
    return [j for j in jobs if j.copy_of is not None]


def find_reuse(store, job: Job, course_id: str, manual_only: bool = False) -> tuple[dict, str, dict | None, str] | None:
    """(raw extraction, source course code, source review file, source model) of a byte-identical
    paper already extracted for another course: a hand-made one first, else the newest reading (a
    Sonnet re-read beats the Haiku one it replaced); None if there is none. Its saved reply is
    reused as is, with its review file when this copy has none of its own. manual_only (--force, a
    re-read): only a hand-made one, so the copies get the new reading instead of the old one."""
    rows = store.db.execute(
        """select p.source_file, p.extraction_model, c.code from past_papers p join courses c on c.id = p.course_id
           where p.file_hash = %s and p.course_id <> %s and (not %s or p.extraction_model = 'manual')
           order by p.extraction_model = 'manual' desc, p.created_at desc""",
        (job.file_hash, course_id, manual_only),
    ).fetchall()
    for r in rows:
        dump = REPORTS / "past_papers" / f"{r['code']}-{Path(r['source_file']).stem}.json"
        if dump.is_file():
            src_review = (DATA / r["source_file"]).with_name(Path(r["source_file"]).stem + ".review.yaml")
            review = yaml.safe_load(src_review.read_text()) if src_review.is_file() else None
            return json.loads(dump.read_text())["raw"], r["code"], review, r["extraction_model"]
    return None


# ── store ──────────────────────────────────────────────────
def stored_fingerprint(store, course_id: str, rel_file: str) -> str | None:
    row = store.db.execute("select fingerprint from past_papers where course_id = %s and source_file = %s", (course_id, rel_file)).fetchone()
    return row["fingerprint"] if row else None


def is_unchanged(store, course_id: str, job: Job) -> bool:
    """Stored, and its file, prompt and review file haven't changed since, whichever model read it: a
    different PAST_Q_MODEL alone doesn't re-read a paper (a Sonnet re-read isn't overwritten by a later
    Haiku run, nor the Haiku papers re-read by Sonnet); --force does."""
    row = store.db.execute("select fingerprint, extraction_model from past_papers where course_id = %s and source_file = %s",
                           (course_id, job.paper.rel_file)).fetchone()
    return bool(row) and row["fingerprint"] == job.fingerprint_for(row["extraction_model"])


def revalidate(store, course_id: str, job: Job) -> bool:
    """--revalidate: give a stored paper its own saved reply again (as a reuse, no model call) so it is
    checked and stored afresh. Papers with answered questions are left alone: re-storing would drop them."""
    row = store.db.execute(
        """select p.extraction_model, exists (select 1 from past_questions q where q.paper_id = p.id and q.model_answer is not null) as answered
           from past_papers p where p.course_id = %s and p.source_file = %s""", (course_id, job.paper.rel_file)).fetchone()
    dump = REPORTS / "past_papers" / f"{job.course.code}-{Path(job.paper.rel_file).stem}.json"
    if not row or row["answered"] or row["extraction_model"] == "manual" or not dump.is_file():
        return False
    job.reuse, job.reuse_model = json.loads(dump.read_text())["raw"], row["extraction_model"]
    return True


def save_paper(store, course_id: str, job: Job, extraction: dict, checked: Checked) -> None:
    paper = extraction.get("paper") or {}
    rules = {k: paper.get(k) for k in ("answer_total", "compulsory", "sections")}
    with store.db.transaction():
        store.db.execute("delete from past_papers where course_id = %s and source_file = %s", (course_id, job.paper.rel_file))
        pid = store.db.execute(
            """insert into past_papers (course_id, session, type, code_on_paper, instructions, rules, duration, total_marks, pages,
                 scanned, source_file, file_hash, status, problems, extraction_model, fingerprint)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
            (course_id, job.paper.session, job.paper.type, job.paper.code_on_paper or paper.get("code_on_paper"),
             job.paper.instructions or paper.get("instructions"), json.dumps(rules), job.paper.duration or paper.get("duration"),
             paper.get("total_marks"), job.pages, job.paper.scanned, job.paper.rel_file, job.file_hash, checked.status,
             json.dumps([p.as_dict() for p in checked.problems]), job.model, job.fingerprint),
        ).fetchone()["id"]
        ids: dict[str, str] = {}
        for order, q in enumerate(checked.questions, 1):
            ids[q["number"]] = store.db.execute(
                """insert into past_questions (course_id, paper_id, number, parent_id, section, text, marks, type, options,
                     extraction_confidence, sort_order)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (course_id, pid, q["number"], ids.get(q["parent"]) if q["parent"] else None, q.get("section"), q.get("text") or "",
                 q.get("marks"), stored_type(q), json.dumps(q["options"]) if q.get("options") else None, q.get("confidence"), order),
            ).fetchone()["id"]


def stored_type(q: dict) -> str:
    """The database requires options on an mcq. A "multiple choice" entry without at least two (e.g. a
    TRUE/FALSE stem) is stored as a plain question; check() has already flagged it (mcq_options)."""
    return "explain" if q["type"] == "mcq" and len(q.get("options") or []) < 2 else q["type"]


# ── report ─────────────────────────────────────────────────
def report_section(job: Job, extraction: dict | None, checked: Checked | None, error: str | None) -> str:
    lines = [f"## {job.name}", "", f"- File: `{job.paper.rel_file}` ({job.pages} pages, {'scanned' if job.paper.scanned else 'text layer'})",
             f"- Listed: {job.paper.session} {job.paper.type}, code on paper {job.paper.code_on_paper or '—'}"
             + (f" · **guessed match**: {job.paper.review}" if job.paper.review else "")]
    turned = [f"p{i} {o}" for i, o in enumerate(job.orientation, 1) if o != "upright"]
    if turned:
        lines.append(f"- Orientation: {'; '.join(turned)}")
    if job.manual is not None or job.manual_error:
        lines.append(f"- Hand-made extraction: `{extraction_path(job.paper).name}` (no model call)")
    if job.reuse is not None or job.copy_of is not None:
        lines.append(f"- Reused the extraction of the identical {job.reuse_from} paper (no model call)")
    if error:
        return "\n".join([*lines, f"- **Status: not extracted** — {error}", ""])
    assert extraction is not None and checked is not None
    p = extraction.get("paper") or {}
    lines += [
        f"- **Status: {checked.status}**" + (f" ({len(checked.blocking)} blocking)" if checked.blocking else ""),
        (f"- On the paper: {p.get('code_on_paper') or '—'} · {p.get('title_on_paper') or '—'} · {p.get('session_on_paper') or '—'} · "
         f"total {p.get('total_marks') if p.get('total_marks') is not None else '—'} · {p.get('duration') or '—'}"),
        (f"- Rubric: {p.get('instructions') or '—'} (answer_total {p.get('answer_total')}, compulsory {p.get('compulsory') or []}, "
         f"sections {[(s['name'], s['choose']) for s in p.get('sections') or []]})"),
        f"- Review file: `{review_path(job.paper).name}` {'(applied)' if job.review else '(none)'}",
        "",
    ]
    if checked.problems:
        lines += ["| Severity | Problem | Question | Detail |", "|---|---|---|---|"]
        order = {"blocking": 0, "warning": 1, "info": 2}
        for pr in sorted(checked.problems, key=lambda x: order[x.severity]):
            lines.append(f"| {pr.severity} | {pr.code} | {pr.question or ''} | {pr.detail.replace('|', '/')} |")
        lines.append("")
    lines += ["| # | Sec | Marks | Type | Conf | Text |", "|---|---|---|---|---|---|"]
    for q in checked.questions:
        text = " ".join((q.get("text") or "").split())
        text = (text[:110] + "…") if len(text) > 110 else text
        marks = "" if q.get("marks") is None else f"{q['marks']:g}"
        lines.append(f"| {q['number']} | {q.get('section') or ''} | {marks} | {q['type']} | {q.get('confidence')} | {text.replace('|', '/') or '*(stem only)*'} |")
    return "\n".join([*lines, ""])


def course_match_report(matches: list[tuple[Job, str, str, str]]) -> str:
    """Every paper's printed code and title against its course. Papers that don't match stay
    needs_review (not shown to students) until the owner confirms them in the paper's review file
    (accept: [code_mismatch] / [title_mismatch] / [course_unconfirmed]) or moves them."""
    order = {"mismatch": 0, "unconfirmed": 1, "match": 2}
    lines = ["# Past papers: course match", "",
             "Papers that don't match stay hidden from students until confirmed.", "",
             "| Verdict | Programme | Course | Paper | Guessed | Printed / detail | Status |", "|---|---|---|---|---|---|---|"]
    for j, verdict, detail, status in sorted(matches, key=lambda m: (order[m[1]], m[0].course.programme, m[0].name)):
        lines.append(f"| {verdict} | {j.course.programme} | {j.course.code} {j.course.title} | {Path(j.paper.rel_file).name} | "
                     f"{'yes' if j.paper.review else ''} | {detail.replace('|', '/')} | {status} |")
    return "\n".join(lines) + "\n"


# Page notes that say the PDF holds more than one test (a CA and the exam, Part A and Part B).
BUNDLED_RE = re.compile(r"\b(two|three|four|several|separate|different|another|multiple)\b[^.]{0,60}\b(papers?|tests?|assessments?|exams?|examinations?|CAs?)\b"
                        r"|\bpages? \d+(-| to )\d+ (is|are) (the )?[^.]{0,40}\b(CA|test|assessment|exam)", re.I)


def write_flagged(store) -> str:
    """data/_reports/past-flagged.md: every stored paper that waits (flag_reasons), one row per file
    (copies in other programmes listed with it), plus ok papers whose PDF seems to hold several tests.
    Papers whose questions are all answered already are left out: nothing waits for them."""
    rows = store.db.execute(
        """select p.source_file, p.file_hash, p.status, p.problems, p.extraction_model, p.session, p.type, p.pages,
                  c.programme, c.level, c.code,
                  exists (select 1 from past_questions q where q.paper_id = p.id and q.model_answer is null
                          and not exists (select 1 from past_questions k where k.parent_id = q.id)) as unanswered
           from past_papers p join courses c on c.id = p.course_id order by c.programme, c.level, c.code, p.source_file"""
    ).fetchall()
    by_file: dict[str, list[dict]] = {}
    for r in rows:
        by_file.setdefault(r["file_hash"], []).append(r)
    flagged, bundled = [], []
    for copies in by_file.values():
        r = copies[0]
        # Papers already answered (live, e.g. the final-year ones) aren't waiting for anything.
        reasons = flag_reasons(r["problems"]) if r["status"] != "ok" or any(c["unanswered"] for c in copies) else []
        dump = REPORTS / "past_papers" / f"{r['code']}-{Path(r['source_file']).stem}.json"
        notes = (json.loads(dump.read_text())["raw"].get("page_notes") or []) if dump.is_file() else []
        multi = next((n for n in notes if BUNDLED_RE.search(n)), None)
        if reasons:
            detail = []
            for code in reasons:
                qs = sorted({p["question"] for p in r["problems"] if p["code"] == code and p.get("question")})
                text = next((p["detail"] for p in r["problems"] if p["code"] == code), "")
                detail.append(f"**{code}**" + (f" ({', '.join(qs[:6])}{'…' if len(qs) > 6 else ''})" if qs else f": {text[:90]}"))
            flagged.append((r, copies, detail, multi))
        elif multi:
            bundled.append((r, copies, multi))

    def where(copies):
        return "<br>".join(f"{c['programme']} {c['level']} {c['code']}" for c in copies)

    def rerun(copies):
        name = Path(copies[0]["source_file"]).name
        return ("`PAST_Q_MODEL=claude-sonnet-5-5 npm run ingest:past -- --force "
                + " ".join(f"--course {c['programme']}/{c['code']}" for c in copies) + f" --paper {name}`")

    blocking = sum(r["status"] == "needs_review" for r, *_ in flagged)
    lines = [f"# Past papers waiting for you — {datetime.now():%Y-%m-%d %H:%M}", "",
             f"{len(by_file)} distinct files stored ({len(rows)} with copies). **{len(flagged)} flagged**: {blocking} hidden from "
             f"students (a blocking problem), {len(flagged) - blocking} shown but not answered yet (a marks warning). "
             f"Flagged papers are not answered until fixed.", "",
             "Fix one by (a) a review file next to the paper (`<name>.review.yaml`: accept / paper / questions / drop / add), "
             "(b) typing it yourself (`<name>.extraction.json`, EXTRACT_SCHEMA; replaces every copy, no API call), or "
             "(c) a Sonnet re-read (≈ $0.05/paper, command below). Then run `npm run ingest:past` again. "
             "medium_confidence alone is not a flag (see the bake-off, Nov 2026).", "",
             f"## Flagged ({len(flagged)})", "",
             "| Filed under | Paper | Pages | Status | Problems | Model | Several tests in the PDF? |", "|---|---|---|---|---|---|---|"]
    for r, copies, detail, multi in flagged:
        lines.append(f"| {where(copies)} | `{r['source_file']}` | {r['pages']} | {r['status']} | {'; '.join(detail).replace('|', '/')} | "
                     f"{r['extraction_model']} | {(multi or '').replace('|', '/')[:140]} |")
    lines += ["", "### Sonnet re-read commands", "", *[f"- {rerun(copies)}" for _, copies, _, _ in flagged], "",
              f"## Not flagged, but the PDF seems to hold several tests ({len(bundled)})", "",
              "Shown to students. Only the listed type may have been transcribed; split the PDF if the other tests are worth having.", "",
              "| Filed under | Paper | Model's note |", "|---|---|---|"]
    for r, copies, multi in bundled:
        lines.append(f"| {where(copies)} | `{r['source_file']}` | {multi.replace('|', '/')[:200]} |")
    FLAGGED.parent.mkdir(parents=True, exist_ok=True)
    FLAGGED.write_text("\n".join(lines) + "\n")
    return f"Flagged: {len(flagged)} of {len(by_file)} distinct files ({blocking} hidden), {len(bundled)} more hold several tests → {FLAGGED}"


# ── main ───────────────────────────────────────────────────
def select(courses: list[Course], course_sel: list[str], paper_sel: list[str]) -> list[tuple[Course, PastPaper]]:
    out = []
    for c in courses:
        if course_sel and not any(c.matches(s) for s in course_sel):
            continue
        for p in c.past_papers:
            if paper_sel and not any(s in p.rel_file for s in paper_sel):
                continue
            out.append((c, p))
    return out


def estimate(jobs: list[Job]) -> float:
    pin, pout = batch.price(PAST_Q_MODEL)
    total_in = total_out = 0
    print(f"\nEstimate ({PAST_Q_MODEL}, Batches API = half price: ${pin * batch.BATCH_DISCOUNT:.2f} / ${pout * batch.BATCH_DISCOUNT:.2f} per M in/out):")
    for j in jobs:
        tin = batch.count_input_tokens(j.params)
        tout = 1500 * j.pages + 4000  # JSON per page + thinking; measured replies replace this guess in the report
        total_in += tin
        total_out += tout
        print(f"  {j.name:<44} {j.pages} pages  {tin:>7,} in  ~{tout:>6,} out  ≈ ${batch.batch_cost(PAST_Q_MODEL, tin, tout):.3f}")
    cost = batch.batch_cost(PAST_Q_MODEL, total_in, total_out)
    print(f"  {'Total':<44} {sum(j.pages for j in jobs)} pages  {total_in:>7,} in  ~{total_out:>6,} out  ≈ ${cost:.2f}")
    return cost


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Extract past papers into past_questions (PRD §9.4).")
    ap.add_argument("--course", action="append", default=[], help="CODE, programme/CODE or institution/programme/CODE (repeatable)")
    ap.add_argument("--paper", action="append", default=[], help="part of the paper's path, e.g. 2025-2026_exam (repeatable)")
    ap.add_argument("--estimate", action="store_true", help="print the cost estimate and stop")
    ap.add_argument("--yes", action="store_true", help="don't ask before submitting")
    ap.add_argument("--no-store", action="store_true", help="extract and report only; don't write the database")
    ap.add_argument("--force", action="store_true", help="re-store papers even if unchanged (with --analyse: re-answer questions)")
    ap.add_argument("--revalidate", action="store_true",
                    help="re-check stored, unanswered papers from their saved replies (no model call), e.g. after a validator fix")
    ap.add_argument("--flagged", action="store_true", help=f"rewrite {FLAGGED.relative_to(ROOT)} from the database and stop")
    ap.add_argument("--analyse", action="store_true", help="step 2: slides, topics, relevance, model answers for stored papers")
    ap.add_argument("--recheck", action="store_true", help="with --analyse: redo partial/general answers whose search now finds new slides")
    args = ap.parse_args(argv)

    try:
        courses = load(DATA)
    except ManifestError as e:
        print(f"Data problems:\n{e}", file=sys.stderr)
        return 2
    if args.flagged:
        from store import Store
        store = Store()
        print(write_flagged(store))
        store.close()
        return 0
    if args.analyse:
        return analyse(courses, args)
    picked = select(courses, args.course, args.paper)
    if not picked:
        print("No past papers match.")
        return 1

    store = None
    course_ids: dict[str, str] = {}
    if not args.no_store:
        from store import Store
        store = Store()
        for c, _ in picked:
            cid = store.course_id(c)
            if cid is None:
                print(f"{c.key} is not in the database yet: run `npm run ingest` first.", file=sys.stderr)
                return 2
            course_ids[c.key] = cid

    jobs = [make_job(c, p) for c, p in picked]
    if store and not args.force:
        # A hand-made extraction of a file replaces every stored copy of it, even an unchanged one.
        hand = {j.file_hash for j in jobs if j.manual is not None} | {
            r["file_hash"] for r in store.db.execute("select file_hash from past_papers where extraction_model = 'manual'").fetchall()}
        unchanged = [j for j in jobs if is_unchanged(store, course_ids[j.course.key], j)
                     and not (j.file_hash in hand and j.manual is None)]
        if args.revalidate:
            again = [j for j in unchanged if revalidate(store, course_ids[j.course.key], j)]
            print(f"  {len(again)} stored paper(s) re-checked from their saved replies (no model call)")
            unchanged = [j for j in unchanged if j not in again]
        for j in unchanged:
            print(f"  unchanged: {j.name}")
        jobs = [j for j in jobs if j not in unchanged]
    if not jobs:
        print("Nothing to do.")
        return 0
    for j in jobs:
        if j.manual is not None:
            print(f"  hand-made extraction (no model call): {j.name}")
        elif j.manual_error:
            print(f"  hand-made extraction rejected: {j.name}: {j.manual_error}")
    if store:
        for j in jobs:
            if j.manual is not None or j.manual_error or j.reuse is not None:
                continue
            found = find_reuse(store, j, course_ids[j.course.key], manual_only=args.force)
            if found:
                j.reuse, j.reuse_from, src_review, j.reuse_model = found
                if j.review is None and src_review:
                    j.review = src_review
                print(f"  identical to the {j.reuse_from} paper, reused (no model call): {j.name}")

    if args.revalidate:
        left = [j for j in jobs if j.reuse is None and j.manual is None and not j.manual_error]
        if left:
            print(f"  --revalidate makes no model calls: {len(left)} paper(s) without a saved reply are left for a normal run")
        jobs = [j for j in jobs if j not in left]
        if not jobs:
            print("Nothing to do.")
            return 0
    # Identical files in this run (one paper filed under several programmes): one request per file.
    copies = group_identical([j for j in jobs if j.reuse is None and not j.manual_error])
    if copies:
        print(f"  {len(copies)} identical cop{'y' if len(copies) == 1 else 'ies'} of a paper in this run: "
              "sent once, the copies reuse that reply")
    model_jobs = [j for j in jobs if j.reuse is None and j.manual is None and not j.manual_error and j.copy_of is None]
    uncached = [j for j in model_jobs if batch.cached(j.params) is None]
    print(f"{len(jobs)} paper(s) to process, {len(model_jobs)} distinct file(s) for the model, "
          f"{len(uncached)} not cached ({PAST_Q_MODEL}).")
    if uncached:
        estimate(uncached)
        if args.estimate:
            return 0
        if not args.yes and input("\nSubmit? [y/N] ").strip().lower() != "y":
            print("Cancelled.")
            return 1
    elif args.estimate:
        print("Everything is cached: $0.")
        return 0

    replies = batch.run({j.custom_id: j.params for j in model_jobs}, label="extract") if model_jobs else {}
    REPORTS.mkdir(parents=True, exist_ok=True)
    sections = []
    matches: list[tuple[Job, str, str, str]] = []  # (job, verdict, detail, status)
    spent = 0.0
    stored = needs_review = failed = 0
    for j in jobs:
        src = j.copy_of or j
        if j.manual_error:
            text, error = None, j.manual_error
        elif j.reuse is not None:
            text, error = json.dumps(j.reuse), None
        elif src.manual is not None:
            text, error = json.dumps(src.manual), None
        else:
            r = replies[src.custom_id]
            if not r.cached and j.copy_of is None:  # a copy's request was paid for by the first
                spent += batch.batch_cost(PAST_Q_MODEL, r.input_tokens, r.output_tokens)
            text, error = r.text, r.error
        if error or not text:
            failed += 1
            sections.append(report_section(j, None, None, error or "empty reply"))
            continue
        try:
            raw = json.loads(text)
            extraction, accepted = apply_review(raw, j.review)
        except (json.JSONDecodeError, ValueError) as e:
            failed += 1
            sections.append(report_section(j, None, None, f"unusable reply: {e}"))
            continue
        also = (j.reuse_from,) if j.reuse_from else ()
        checked = check(extraction, course_code=j.course.code, aliases=j.course.aliases, listed_code=j.paper.code_on_paper,
                        accepted=accepted, course_title=j.course.title, guessed=course_guessed(j.paper.review), also_codes=also,
                        placeholder_code=not j.course.code_confirmed)
        verdict, detail = course_match(extraction.get("paper") or {}, course_code=j.course.code, aliases=j.course.aliases,
                                       listed_codes=(j.paper.code_on_paper, *also), course_title=j.course.title)
        matches.append((j, verdict, detail, checked.status))
        dump = REPORTS / "past_papers" / f"{j.course.code}-{Path(j.paper.rel_file).stem}.json"
        dump.parent.mkdir(parents=True, exist_ok=True)
        dump.write_text(json.dumps({"model": j.model, "raw": raw, "checked": checked.questions,
                                    "problems": [p.as_dict() for p in checked.problems]}, indent=1, ensure_ascii=False))
        sections.append(report_section(j, extraction, checked, None))
        if store:
            save_paper(store, course_ids[j.course.key], j, extraction, checked)
            stored += 1
            needs_review += checked.status == "needs_review"
        print(f"  {j.name}: {len(checked.questions)} entries, {len(checked.blocking)} blocking, "
              f"{sum(p.severity == 'warning' for p in checked.problems)} warnings → {checked.status}")

    now = datetime.now()
    report = REPORTS / f"past_papers-{now:%Y-%m-%d-%H%M}.md"
    header = f"# Past papers review — {now:%Y-%m-%d %H:%M}\n\nModel: {PAST_Q_MODEL} · prompt v{PROMPT_VERSION} · spent ≈ ${spent:.3f}\n\n"
    report.write_text(header + "\n".join(sections))
    print(f"\nReport: {report}")
    if matches:
        mreport = REPORTS / f"past_course_match-{now:%Y-%m-%d-%H%M}.md"
        mreport.write_text(course_match_report(matches))
        bad = [m for m in matches if m[1] != "match"]
        print(f"Course match: {len(matches) - len(bad)} match, {sum(m[1] == 'mismatch' for m in matches)} mismatch, "
              f"{sum(m[1] == 'unconfirmed' for m in matches)} unconfirmed → {mreport}")
        for j, verdict, detail, status in bad:
            print(f"  {verdict:<12} {j.course.programme}/{j.name}: {detail} ({'guessed, ' if j.paper.review else ''}{status})")
    print(f"Stored {stored} paper(s) ({needs_review} need review), {failed} failed. Spent ≈ ${spent:.3f}.")
    batch.log_spend("extract", {PAST_Q_MODEL: spent})
    if store:
        print(write_flagged(store))
        store.close()
    return 1 if failed else 0


def analyse(courses: list[Course], args) -> int:
    import past_analysis as pa
    from store import Store

    store = Store()
    chosen = [c for c in courses if not args.course or any(c.matches(s) for s in args.course)]
    work: list[tuple[Course, list[dict], list]] = []
    reused = rechecked = 0
    # CS before SEN: a Software Engineering copy reuses the CS answer once it exists.
    chosen.sort(key=lambda c: c.programme == "software-engineering")
    for c in chosen:
        cid = store.course_id(c)
        if cid is None:
            continue
        jobs = pa.load_jobs(store, cid, force=args.force, recheck=args.recheck)
        if not jobs:
            continue
        topics = pa.course_topics(store, cid)
        todo = []
        for j in jobs:
            pa.retrieve(store, j)
            if args.recheck:
                if not j.slides or not pa.has_new_slides(store, j):
                    continue
                rechecked += 1
            src = pa.reuse_answer(store, j) if not args.recheck else None
            if src:
                pa.save_reused(store, j, src, topics)
                reused += 1
                continue
            j.params = pa.build_params(c, topics, j)
            todo.append(j)
        if todo:
            work.append((c, topics, todo))
        elif jobs:
            pa.roll_up(store, cid)
    if reused:
        print(f"Reused {reused} answer(s) from identical papers in another programme (same slides): $0.")
    if args.recheck:
        print(f"Recheck: {rechecked} partial/general answer(s) now find new slides and will be regenerated.")
    all_jobs = [j for _, _, js in work for j in js]
    if not all_jobs:
        print("No new questions to analyse; checking repeats only.")
    uncached = [j for j in all_jobs if batch.cached(j.params) is None]
    print(f"{len(all_jobs)} question(s) to analyse, {len(uncached)} need the model ({PAST_ANSWER_MODEL}).")
    if all_jobs and uncached:
        tin, tout = pa.estimate_tokens(uncached)
        print(f"Estimate: {tin:,} in, ~{tout:,} out ≈ ${batch.batch_cost(PAST_ANSWER_MODEL, tin, tout):.2f}")
        if args.estimate:
            return 0
        if not args.yes and input("Submit? [y/N] ").strip().lower() != "y":
            print("Cancelled.")
            return 1
    replies = batch.run({j.custom_id: j.params for j in all_jobs}, label="analyse") if all_jobs else {}

    spent = 0.0
    lines = [f"# Past questions analysis — {datetime.now():%Y-%m-%d %H:%M}", "", f"Model: {PAST_ANSWER_MODEL} · analysis v{pa.ANALYSE_VERSION}", ""]
    grounded = {"slides": 0, "partial": 0, "general": 0}
    failed = flagged = 0
    for c, topics, jobs in work:
        names = {str(t["id"]): t["title"] for t in topics}
        lines += [f"## {c.programme}/{c.code} {c.title}", "", "| Paper | # | Marks | Grounding | Topics | Cites | Problems |", "|---|---|---|---|---|---|---|"]
        for j in jobs:
            r = replies[j.custom_id]
            if not r.cached:
                spent += batch.batch_cost(PAST_ANSWER_MODEL, r.input_tokens, r.output_tokens)
            if r.error or not r.text:
                failed += 1
                lines.append(f"| {j.paper} | {j.number} | | | | | **failed**: {r.error or 'empty'} |")
                continue
            a = pa.check_analysis(json.loads(r.text), j, topics)
            pa.save(store, j, a)
            flagged += bool(a.problems)
            cites = len(set(pa.CITE_RE.findall(a.model_answer)))
            marks = "" if j.marks is None else f"{j.marks:g}"
            grounded[pa.grounding(a.relevance)] += 1
            lines.append(f"| {j.paper} | {j.number} | {marks} | {pa.grounding(a.relevance)} | {'; '.join(names[t] for t in a.topics)} | {cites} | "
                         f"{'; '.join(a.problems).replace('|', '/')} |")
        pa.roll_up(store, store.course_id(c))
        lines.append("")
    # Repeats: one small request per course with candidate pairs (cheap; cached like everything else).
    repeat_jobs = {}
    for c in chosen:
        cid = store.course_id(c)
        if cid is None:
            continue
        pairs = pa.repeat_candidates(store, cid)
        if pairs:
            repeat_jobs[f"rep-{cid}"] = (c, cid, pairs, pa.repeat_params(c, pairs))
    if repeat_jobs:
        rep = batch.run({k: v[3] for k, v in repeat_jobs.items()}, label="repeats")
        lines += ["## Repeats", ""]
        for k, (c, cid, pairs, _) in repeat_jobs.items():
            r = rep[k]
            if not r.cached:
                spent += batch.batch_cost(PAST_ANSWER_MODEL, r.input_tokens, r.output_tokens)
            if r.error or not r.text:
                lines.append(f"- {c.code}: repeat check failed ({r.error})")
                continue
            same = json.loads(r.text)["same"]
            n = pa.save_repeats(store, cid, pairs, same)
            lines.append(f"- {c.code}: {len(pairs)} candidate pair(s), {len(same)} confirmed, {n} repeat group(s)")
            for i in same:
                if 1 <= i <= len(pairs):
                    p = pairs[i - 1]
                    lines.append(f"  - {p['a_session']} {p['a_type']} {p['a_number']} ↔ {p['b_session']} {p['b_type']} {p['b_number']} (similarity {p['similarity']:.2f})")
        lines.append("")
    REPORTS.mkdir(parents=True, exist_ok=True)
    report = REPORTS / f"past_analysis-{datetime.now():%Y-%m-%d-%H%M}.md"
    lines.insert(3, f"Spent ≈ ${spent:.3f} · {len(all_jobs)} questions · {flagged} with problems · {failed} failed · "
                    f"grounding: {grounded['slides']} slides, {grounded['partial']} partial, {grounded['general']} general · {reused} reused\n")
    report.write_text("\n".join(lines))
    batch.log_spend("analyse", {PAST_ANSWER_MODEL: spent})
    print(f"Report: {report}\nAnalysed {len(all_jobs) - failed} question(s), {flagged} with problems, {failed} failed. Spent ≈ ${spent:.3f}.")
    store.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
