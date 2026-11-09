"""Past papers → past_questions (PRD F10, §9.4).

    npm run ingest:past -- --estimate                       # cost estimate only, nothing sent
    npm run ingest:past -- --course INS401 --paper 2025-2026_exam
    npm run ingest:past -- --yes                            # skip the confirmation prompt
    npm run ingest:past -- --no-store                       # extract + report, don't write the DB

Steps (phase 1): render pages → extract with PAST_Q_MODEL through the Message Batches API → apply
the paper's review file → check → write the review report → store (status ok | needs_review).

Idempotent: a paper whose file, model, prompt and review file are unchanged is skipped; every model
reply is cached in data/.cache/batches, so re-running after a fix only pays for what changed.

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
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import batch
import pymupdf
import yaml
from config import DATA, PAST_Q_MODEL, ROOT
from manifest import Course, ManifestError, PastPaper, load
from past_validate import CONFIDENCE, QUESTION_TYPES, Checked, apply_review, check

PROMPT_VERSION = "2"  # bump only to re-extract every paper (a re-store replaces its questions)
LONG_EDGE = 1568  # Claude's vision input is downscaled beyond this; render at it so nothing is wasted
REPORTS = ROOT / "data" / ".reports"
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

The {n} page image(s) above are the paper, in order.{text_layer}

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
    review: dict | None
    review_hash: str
    params: dict
    pages: int

    @property
    def custom_id(self) -> str:
        return hashlib.sha256(self.paper.rel_file.encode()).hexdigest()[:40]

    @property
    def fingerprint(self) -> str:
        return hashlib.sha256(f"{self.file_hash}|{PAST_Q_MODEL}|{PROMPT_VERSION}|{self.review_hash}".encode()).hexdigest()

    @property
    def name(self) -> str:
        return f"{self.course.code} {Path(self.paper.rel_file).name}"


def render_pages(path: Path) -> list[tuple[bytes, str]]:
    """[(jpeg, text layer)] per page, long edge = LONG_EDGE px. JPEG keeps scanned pages small."""
    out = []
    with pymupdf.open(path) as doc:
        for page in doc:
            zoom = LONG_EDGE / max(page.rect.width, page.rect.height)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
            out.append((pix.tobytes("jpeg", jpg_quality=88), page.get_text("text").strip()))
    return out


def build_params(course: Course, paper: PastPaper, pages: list[tuple[bytes, str]]) -> dict:
    content: list[dict] = []
    for i, (jpeg, _) in enumerate(pages, 1):
        content.append({"type": "text", "text": f"Page {i}:"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(jpeg).decode()}})
    layer = "\n\n".join(f"--- Page {i} ---\n{text}" for i, (_, text) in enumerate(pages, 1) if len(text) > 40)
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
    )})
    return {
        "model": PAST_Q_MODEL,
        "max_tokens": 32000,
        "output_config": {"effort": "medium", "format": {"type": "json_schema", "schema": EXTRACT_SCHEMA}},
        "messages": [{"role": "user", "content": content}],
    }


def review_path(paper: PastPaper) -> Path:
    return paper.file.with_name(paper.file.stem + ".review.yaml")


def make_job(course: Course, paper: PastPaper) -> Job:
    if paper.file.suffix.lower() != ".pdf":
        raise SystemExit(f"{paper.rel_file}: only PDF past papers are supported")
    raw = paper.file.read_bytes()
    rpath = review_path(paper)
    review_bytes = rpath.read_bytes() if rpath.is_file() else b""
    review = yaml.safe_load(review_bytes) if review_bytes else None
    pages = render_pages(paper.file)
    return Job(course, paper, hashlib.sha256(raw).hexdigest(), review, hashlib.sha256(review_bytes).hexdigest(),
               build_params(course, paper, pages), len(pages))


# ── store ──────────────────────────────────────────────────
def stored_fingerprint(store, course_id: str, rel_file: str) -> str | None:
    row = store.db.execute("select fingerprint from past_papers where course_id = %s and source_file = %s", (course_id, rel_file)).fetchone()
    return row["fingerprint"] if row else None


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
             json.dumps([p.as_dict() for p in checked.problems]), PAST_Q_MODEL, job.fingerprint),
        ).fetchone()["id"]
        ids: dict[str, str] = {}
        for order, q in enumerate(checked.questions, 1):
            ids[q["number"]] = store.db.execute(
                """insert into past_questions (course_id, paper_id, number, parent_id, section, text, marks, type, options,
                     extraction_confidence, sort_order)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (course_id, pid, q["number"], ids.get(q["parent"]) if q["parent"] else None, q.get("section"), q.get("text") or "",
                 q.get("marks"), q["type"], json.dumps(q["options"]) if q.get("options") else None, q.get("confidence"), order),
            ).fetchone()["id"]


# ── report ─────────────────────────────────────────────────
def report_section(job: Job, extraction: dict | None, checked: Checked | None, error: str | None) -> str:
    lines = [f"## {job.name}", "", f"- File: `{job.paper.rel_file}` ({job.pages} pages, {'scanned' if job.paper.scanned else 'text layer'})",
             f"- Listed: {job.paper.session} {job.paper.type}, code on paper {job.paper.code_on_paper or '—'}"]
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
    ap.add_argument("--analyse", action="store_true", help="step 2: slides, topics, relevance, model answers for stored papers")
    args = ap.parse_args(argv)

    try:
        courses = load(DATA)
    except ManifestError as e:
        print(f"Data problems:\n{e}", file=sys.stderr)
        return 2
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
        unchanged = [j for j in jobs if stored_fingerprint(store, course_ids[j.course.key], j.paper.rel_file) == j.fingerprint]
        for j in unchanged:
            print(f"  unchanged: {j.name}")
        jobs = [j for j in jobs if j not in unchanged]
    if not jobs:
        print("Nothing to do.")
        return 0

    uncached = [j for j in jobs if batch.cached(j.params) is None]
    print(f"{len(jobs)} paper(s) to process, {len(uncached)} need the model ({PAST_Q_MODEL}).")
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

    replies = batch.run({j.custom_id: j.params for j in jobs}, label="extract")
    REPORTS.mkdir(parents=True, exist_ok=True)
    sections = []
    spent = 0.0
    stored = needs_review = failed = 0
    for j in jobs:
        r = replies[j.custom_id]
        if not r.cached:
            spent += batch.batch_cost(PAST_Q_MODEL, r.input_tokens, r.output_tokens)
        if r.error or not r.text:
            failed += 1
            sections.append(report_section(j, None, None, r.error or "empty reply"))
            continue
        try:
            raw = json.loads(r.text)
            extraction, accepted = apply_review(raw, j.review)
        except (json.JSONDecodeError, ValueError) as e:
            failed += 1
            sections.append(report_section(j, None, None, f"unusable reply: {e}"))
            continue
        checked = check(extraction, course_code=j.course.code, aliases=j.course.aliases, listed_code=j.paper.code_on_paper, accepted=accepted)
        dump = REPORTS / "past_papers" / f"{j.course.code}-{Path(j.paper.rel_file).stem}.json"
        dump.parent.mkdir(parents=True, exist_ok=True)
        dump.write_text(json.dumps({"model": PAST_Q_MODEL, "raw": raw, "checked": checked.questions,
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
    print(f"Stored {stored} paper(s) ({needs_review} need review), {failed} failed. Spent ≈ ${spent:.3f}.")
    if store:
        store.close()
    return 1 if failed else 0


def analyse(courses: list[Course], args) -> int:
    import past_analysis as pa
    from store import Store

    store = Store()
    chosen = [c for c in courses if not args.course or any(c.matches(s) for s in args.course)]
    work: list[tuple[Course, list[dict], list]] = []
    for c in chosen:
        cid = store.course_id(c)
        if cid is None:
            continue
        jobs = pa.load_jobs(store, cid, force=args.force)
        if not jobs:
            continue
        topics = pa.course_topics(store, cid)
        for j in jobs:
            pa.retrieve(store, j)
            j.params = pa.build_params(c, topics, j)
        work.append((c, topics, jobs))
    all_jobs = [j for _, _, js in work for j in js]
    if not all_jobs:
        print("No new questions to analyse; checking repeats only.")
    uncached = [j for j in all_jobs if batch.cached(j.params) is None]
    print(f"{len(all_jobs)} question(s) to analyse, {len(uncached)} need the model ({PAST_Q_MODEL}).")
    if all_jobs and uncached:
        tin, tout = pa.estimate_tokens(uncached)
        print(f"Estimate: {tin:,} in, ~{tout:,} out ≈ ${batch.batch_cost(PAST_Q_MODEL, tin, tout):.2f}")
        if args.estimate:
            return 0
        if not args.yes and input("Submit? [y/N] ").strip().lower() != "y":
            print("Cancelled.")
            return 1
    replies = batch.run({j.custom_id: j.params for j in all_jobs}, label="analyse") if all_jobs else {}

    spent = 0.0
    lines = [f"# Past questions analysis — {datetime.now():%Y-%m-%d %H:%M}", "", f"Model: {PAST_Q_MODEL} · analysis v{pa.ANALYSE_VERSION}", ""]
    failed = flagged = 0
    for c, topics, jobs in work:
        names = {str(t["id"]): t["title"] for t in topics}
        lines += [f"## {c.code} {c.title}", "", "| Paper | # | Marks | Relevance | Topics | Cites | Problems |", "|---|---|---|---|---|---|---|"]
        for j in jobs:
            r = replies[j.custom_id]
            if not r.cached:
                spent += batch.batch_cost(PAST_Q_MODEL, r.input_tokens, r.output_tokens)
            if r.error or not r.text:
                failed += 1
                lines.append(f"| {j.paper} | {j.number} | | | | | **failed**: {r.error or 'empty'} |")
                continue
            a = pa.check_analysis(json.loads(r.text), j, topics)
            pa.save(store, j, a)
            flagged += bool(a.problems)
            cites = len(set(pa.CITE_RE.findall(a.model_answer)))
            marks = "" if j.marks is None else f"{j.marks:g}"
            lines.append(f"| {j.paper} | {j.number} | {marks} | {a.relevance} | {'; '.join(names[t] for t in a.topics)} | {cites} | "
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
                spent += batch.batch_cost(PAST_Q_MODEL, r.input_tokens, r.output_tokens)
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
    lines.insert(3, f"Spent ≈ ${spent:.3f} · {len(all_jobs)} questions · {flagged} with problems · {failed} failed\n")
    report.write_text("\n".join(lines))
    print(f"Report: {report}\nAnalysed {len(all_jobs) - failed} question(s), {flagged} with problems, {failed} failed. Spent ≈ ${spent:.3f}.")
    store.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
