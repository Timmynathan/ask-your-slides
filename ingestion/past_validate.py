"""Checks on an extracted past paper (PRD §9.4 step 3). Pure functions: no network, no DB.

An extraction is the JSON the model returns (EXTRACT_SCHEMA in past_papers.py), after the paper's
review file (if any) has been applied. Every problem is reported, never silently dropped:

  blocking  the paper is stored as `needs_review` (hidden from students) until fixed
  warning   stored and shown, listed in the review report
  info      listed only

A problem can be accepted in the review file (`accept: [code]` or `accept: [code:Q2]`), which turns
it into info.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from dataclasses import dataclass, field

QUESTION_TYPES = ("define", "explain", "compare", "calculate", "code", "case_study", "mcq", "essay")
CONFIDENCE = ("high", "medium", "low")
# Q2, Q2b, Q2b(iii), and Q2(iii): roman parts straight under a question (no lettered part), as
# many SMSS papers number them.
NUMBER_RE = re.compile(r"^Q(\d+)([a-z])?(?:\(([ivx]+)\))?$")
_BARE_ROMAN = (re.compile(r"^Q(\d+)()([ivx]+)$"), re.compile(r"^Q(\d+)([a-z])([ivx]+)$"))  # 'Q1ii' before 'Q1bii'
ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"]
TOLERANCE = 0.01


@dataclass
class Problem:
    code: str
    severity: str  # blocking | warning | info
    detail: str
    question: str | None = None

    @property
    def key(self) -> str:
        return f"{self.code}:{self.question}" if self.question else self.code

    def as_dict(self) -> dict:
        return {"code": self.code, "severity": self.severity, "detail": self.detail, "question": self.question}


@dataclass
class Checked:
    questions: list[dict]  # in paper order, with "marks" filled from sub-parts where the paper only printed those
    problems: list[Problem] = field(default_factory=list)

    @property
    def blocking(self) -> list[Problem]:
        return [p for p in self.problems if p.severity == "blocking"]

    @property
    def status(self) -> str:
        return "needs_review" if self.blocking else "ok"


# A paper waits (listed in data/_reports/past-flagged.md, not answered) for any blocking problem or
# one of these warnings. medium_confidence alone doesn't count: it fired on 16 of 20 papers in the
# Haiku/Sonnet bake-off (Nov 2026) and didn't separate good reads from bad ones.
FLAG_WARNINGS = ("total_marks", "subparts_sum", "missing_marks")


def flag_reasons(problems: list[dict]) -> list[str]:
    """The stored problems (Problem.as_dict, accepted ones already downgraded) that make a paper wait."""
    return sorted({p["code"] for p in problems or [] if p["severity"] == "blocking" or (p["severity"] == "warning" and p["code"] in FLAG_WARNINGS)})


def parse_number(number: str) -> tuple[int, int | None, int | None] | None:
    """'Q2b(iii)' → (2, 2, 3); 'Q2(iii)' → (2, None, 3); 'Q2b' → (2, 2, None); 'Q2' → (2, None, None)."""
    m = NUMBER_RE.match(number or "")
    if not m:
        return None
    top = int(m.group(1))
    sub = ord(m.group(2)) - ord("a") + 1 if m.group(2) else None
    roman = ROMAN.index(m.group(3)) + 1 if m.group(3) in ROMAN else (None if m.group(3) is None else -1)
    if roman == -1:
        return None
    return top, sub, roman


def expected_parent(number: str) -> str | None:
    m = NUMBER_RE.match(number)
    if not m:
        return None
    if m.group(3):
        return f"Q{m.group(1)}{m.group(2) or ''}"
    if m.group(2):
        return f"Q{m.group(1)}"
    return None


def normalize_code(code: str | None) -> str:
    """'PAU-CSC 412' → 'CSC412'."""
    s = re.sub(r"[^A-Z0-9]", "", (code or "").upper())
    return s.removeprefix("PAU")


def apply_review(extraction: dict, review: dict | None) -> tuple[dict, set[str]]:
    """Apply a paper's review file: `renumber: [Q1a, Q1b, null, …]`, `paper:` field overrides,
    `questions: {Q2b: {marks: 6}}`, `drop: [Q9]`, `add: [{number, ...}]` and `accept: [code or code:Q2]`.
    Returns (extraction, accepted keys)."""
    if not review:
        return extraction, set()
    paper = {**extraction.get("paper", {}), **(review.get("paper") or {})}
    overrides = review.get("questions") or {}
    drop = set(review.get("drop") or [])
    questions = [dict(q) for q in extraction.get("questions", [])]
    renumber = review.get("renumber")
    if renumber is not None:
        # One new number per extracted entry, in order (null = drop it). For papers whose own numbering
        # is broken (repeated numbers, i–x lists): sets the parent and strips a leading "iv." marker.
        if len(renumber) != len(questions):
            raise ValueError(f"renumber has {len(renumber)} numbers for {len(questions)} extracted entries")
        renamed = []
        for q, new in zip(questions, renumber):
            if new:
                text = re.sub(r"^\s*(?:[ivx]+|[a-z]|\d+)[.)]\s+", "", q.get("text") or "")
                renamed.append({**q, "number": new, "parent": expected_parent(new), "text": text})
        questions = renamed
    questions = [{**q, **(overrides.get(q.get("number")) or {})} for q in questions if q.get("number") not in drop]
    known = {q.get("number") for q in questions}
    unknown = [n for n in overrides if n not in known]
    if unknown:
        raise ValueError(f"review file overrides unknown question(s): {', '.join(unknown)}")
    questions += [dict(q) for q in review.get("add") or []]
    return {**extraction, "paper": paper, "questions": questions}, {str(a) for a in review.get("accept") or []}


TITLE_MATCH = 0.6
_TITLE_NOISE = {"and", "of", "the", "in", "for", "to", "a", "an", "units", "unit", "pau"}


# Words of a heading that names the test, not the course ('First Semester Quiz', 'CA1', 'Test 2').
_GENERIC_TITLE = {"first", "second", "third", "semester", "examination", "examinations", "exam", "exams", "test", "tests",
                  "quiz", "continuous", "assessment", "assignment", "question", "questions", "paper", "mid", "midsemester",
                  "ca", "session", "final", "practice", "theory", "option", "section", "part", "jan", "january", "feb",
                  "february", "march", "april", "may", "june", "july", "august", "sept", "september", "oct", "october",
                  "nov", "november", "dec", "december"}


def _title_words(t: str) -> list[str]:
    t = re.sub(r"\b[A-Z]{2,4}\s?\d{3}\b", " ", t)  # course codes
    t = re.sub(r"(?<=[A-Za-z])-(?=[A-Za-z])", "", t)  # 'E-Commerce' = 'ECommerce'
    return [w for w in re.findall(r"[a-z]+", t.lower()) if w not in _TITLE_NOISE]


def generic_title(t: str | None) -> bool:
    """The 'title' only names the test ('Continuous Assessment Question', 'CA1'): it says nothing about the course."""
    return bool(t) and all(w in _GENERIC_TITLE or len(w) <= 2 for w in _title_words(t))


def title_similarity(a: str, b: str) -> float:
    """Share of the shorter title's words found in the other, ignoring small words, codes and "(2 Units)".
    Words match on their first 5 letters, or when nearly the same word (a typo: 'Intoductory'):
    'Ethical and Legal Issues in Computing' vs 'Ethics and Legal Issues for CSC…' → 0.75."""
    x, y = set(_title_words(a)), set(_title_words(b))
    if not x or not y:
        return 1.0
    small, big = (x, y) if len(x) <= len(y) else (y, x)
    same = lambda u, v: u[:5] == v[:5] or (min(len(u), len(v)) >= 5 and SequenceMatcher(None, u, v).ratio() >= 0.85)
    return sum(any(same(u, v) for v in big) for u in small) / len(small)


# A review note about the course itself, not 'Several photos joined into one paper': the course was guessed.
_GUESSED_RE = re.compile(r"\bcourse\b|assumed|archive title", re.I)


def course_guessed(review: str | None) -> bool:
    return bool(review and _GUESSED_RE.search(review))


def course_match(paper: dict, *, course_code: str, aliases: tuple[str, ...] = (), listed_codes: tuple[str | None, ...] = (),
                 course_title: str | None = None) -> tuple[str, str]:
    """Does the printed code and title belong to this course? → (verdict, detail).

    verdict: "match" (what is printed agrees), "mismatch" (a printed code or title disagrees),
    "unconfirmed" (neither is printed). PAU reuses codes for other courses, so the title decides
    when both are printed; a code alone that differs is a mismatch.
    """
    code, title = paper.get("code_on_paper"), paper.get("title_on_paper")
    title = None if generic_title(title) else title
    known = {normalize_code(c) for c in (course_code, *aliases, *listed_codes) if c}
    code_ok = normalize_code(code) in known if code else None
    title_ok = title_similarity(title, course_title) >= TITLE_MATCH if title and course_title else None
    printed = f"printed {code or '—'} · {title or '—'}"
    if code_ok is None and title_ok is None:
        return "unconfirmed", f"no course code or title printed; listed as {course_code} {course_title or ''}".strip()
    if title_ok is False or (code_ok is False and not title_ok):
        return "mismatch", f"{printed}; course is {course_code} {course_title or ''}".strip()
    return "match", printed


_ARABIC_SUB = re.compile(r"^Q(\d+)([a-z])?\((\d{1,2})\)$")
# '11', '11b', 'Question 11', 'q11.', '11 (ii)' → 'Q11', 'Q11b', ... (Haiku sometimes drops the Q, bake-off Nov 2026)
_NO_Q = re.compile(r"^(?:q(?:uestion)?\s*)?(\d+)\s*\.?\s*([a-z]?)\s*(\([ivx]+\)|\(\d{1,2}\))?\.?$", re.I)
_TOP = re.compile(r"^Q(\d+)")
# Section-prefixed numbers → the section plus Q-form (bake-off/Haiku run, Nov 2026):
# 'Part1-Q1', 'CA1-Q2', 'S2-Q1', 'P2Q1' and 'A1', 'B-Q1a', 'QB1', 'BQ1'.
_SECTION_PREFIX = (
    (re.compile(r"^(section|part|sec|ca|s|p|t)\s*(\d+|[a-h])\s*[-:.]?\s*q(?:uestion)?\s*(\d.*)$", re.I), "{0} {1}"),
    (re.compile(r"^Q?()([A-H])\s*[-:.]?\s*Q?(\d.*)$"), "Section {1}"),
)


def _restart_sections(questions: list[dict]) -> None:
    """A section that numbers its questions from 1 again (Section A Q1–Q30, Section B Q1–Q6):
    its questions continue after the highest number before it, so every number is unique. The
    section letter still says where they are on the paper."""
    seen: dict[int, str | None] = {}
    highest = 0
    offset: dict[str | None, int] = {}
    for q in questions:
        m = _TOP.match(q.get("number") or "")
        if not m:
            continue
        top, sec = int(m.group(1)), q.get("section")
        if sec in offset:
            top += offset[sec]
        elif top in seen and seen[top] != sec and q.get("parent") is None:
            offset[sec] = highest
            top += highest
        if sec in offset:
            for key in ("number", "parent"):
                v = q.get(key)
                if v:
                    q[key] = _TOP.sub(lambda mm: f"Q{int(mm.group(1)) + offset[sec]}", v, count=1)
        seen.setdefault(top, sec)
        highest = max(highest, top)


def normalize_numbers(questions: list[dict]) -> list[dict]:
    """Make the model's numbering fit Q1 / Q1a / Q1a(ii) / Q1(ii): restarted sections continue
    their numbering; 'Q3b(1)' → 'Q3b(i)'; 'Q1ii' → 'Q1(ii)' (parents too). A one-letter numeral
    ('Q1i', 'Q1v', 'Q1x') is renamed only when 'Q1ii' is also there: alone it may be a lettered part."""
    for q in questions:
        for field in ("number", "parent"):
            n = (q.get(field) or "").strip()
            for rx, label in _SECTION_PREFIX:
                m = rx.match(n)
                if n and m and not NUMBER_RE.match(n):
                    n = q[field] = f"Q{m.group(3)}"
                    if field == "number" and not q.get("section"):
                        q["section"] = label.format(m.group(1).upper() if len(m.group(1)) <= 2 else m.group(1).title(),
                                                    m.group(2).upper())
                    break
            m = _NO_Q.match(n)
            if n and m and not NUMBER_RE.match(n):
                q[field] = f"Q{m.group(1)}{m.group(2).lower()}{(m.group(3) or '').lower()}"
    _restart_sections(questions)
    numbers = {q.get("number") or "" for q in questions}
    rename: dict[str, str] = {}
    for n in numbers:
        m = _ARABIC_SUB.match(n)
        if m and 1 <= int(m.group(3)) <= len(ROMAN):
            rename[n] = f"Q{m.group(1)}{m.group(2) or ''}({ROMAN[int(m.group(3)) - 1]})"
    for n in numbers:
        m = _BARE_ROMAN[0].match(n) or _BARE_ROMAN[1].match(n)
        if n in rename or not m or m.group(3) not in ROMAN:
            continue
        base = f"Q{m.group(1)}{m.group(2) or ''}"
        if len(m.group(3)) == 1 and f"{base}ii" not in numbers:
            continue
        rename[n] = f"{base}({m.group(3)})"
    for q in questions:
        q["number"] = rename.get(q.get("number"), q.get("number"))
        if q.get("parent") in rename:
            q["parent"] = rename[q["parent"]]
    return questions


def check(extraction: dict, *, course_code: str, aliases: tuple[str, ...] = (), listed_code: str | None = None,
          accepted: set[str] | None = None, course_title: str | None = None, guessed: bool = False,
          also_codes: tuple[str, ...] = (), placeholder_code: bool = False) -> Checked:
    """`guessed`: the paper was matched to this course from an archive folder name (past_papers.yaml
    `review:`), so the paper itself must confirm it before students see it. `also_codes`: codes known
    to be the same course (a reused paper's source course, e.g. CSC412 for SEN412). `placeholder_code`:
    the course's own code isn't known (course.yaml code_confirmed: false), so a printed code can't contradict it."""
    accepted = accepted or set()
    problems: list[Problem] = []
    add = lambda code, sev, detail, q=None: problems.append(Problem(code, sev, detail, q))

    paper = extraction.get("paper") or {}
    raw = normalize_numbers([dict(q) for q in extraction.get("questions") or []])
    if not raw:
        add("no_questions", "blocking", "no questions were extracted")

    # ── numbering ──────────────────────────────────────────
    by_number: dict[str, dict] = {}
    for q in raw:
        n = q.get("number") or ""
        if parse_number(n) is None:
            add("numbering_format", "blocking", f"{n!r} is not Q1 / Q1a / Q1a(ii)", n or None)
            continue
        if n in by_number:
            add("duplicate_number", "blocking", f"{n} appears twice", n)
            continue
        by_number[n] = q
    for n, q in by_number.items():
        want = expected_parent(n)
        if (q.get("parent") or None) != want:
            add("wrong_parent", "blocking", f"parent is {q.get('parent')!r}, expected {want!r}", n)
        if want and want not in by_number:
            add("missing_parent", "blocking", f"{want} is missing (needed by {n})", n)
    _check_gaps(list(by_number), add)

    children: dict[str, list[str]] = {}
    for n in by_number:
        p = expected_parent(n)
        if p:
            children.setdefault(p, []).append(n)

    # ── each question ──────────────────────────────────────
    for n, q in by_number.items():
        text = (q.get("text") or "").strip()
        if q.get("type") not in QUESTION_TYPES:
            add("bad_type", "blocking", f"type {q.get('type')!r}", n)
        if not text and n not in children:
            add("empty_text", "blocking", "no question text", n)
        if q.get("unreadable") or "[unreadable" in text.lower():
            add("unreadable", "blocking", "part of the text could not be read", n)
        conf = q.get("confidence")
        if conf == "low":
            add("low_confidence", "blocking", "the model was not sure of the text", n)
        elif conf == "medium":
            add("medium_confidence", "warning", "a few words were inferred from context", n)
        if q.get("type") == "mcq" and len(q.get("options") or []) < 2:
            add("mcq_options", "blocking", "multiple choice without at least two options", n)
        if q.get("note"):
            add("model_note", "info", str(q["note"]), n)

    # ── marks ──────────────────────────────────────────────
    eff: dict[str, float | None] = {}

    def effective(n: str) -> float | None:
        """Printed marks, or the sum of the parts when only the parts carry marks."""
        if n in eff:
            return eff[n]
        q = by_number[n]
        kids = children.get(n, [])
        kid_marks = [effective(k) for k in kids]
        own = float(q["marks"]) if q.get("marks") is not None else None
        value = own
        if kids and all(m is not None for m in kid_marks):
            total = sum(kid_marks)  # type: ignore[arg-type]
            if own is not None and abs(own - total) > TOLERANCE:
                add("subparts_sum", "warning", f"marks {own:g} but its parts add up to {total:g}", n)
            value = own if own is not None else total
        eff[n] = value
        return value

    for n in by_number:
        effective(n)
    tops = sorted((n for n in by_number if expected_parent(n) is None), key=lambda n: parse_number(n)[0])  # type: ignore[index]
    top_marks = {n: eff[n] for n in tops}
    for n, qq in by_number.items():
        if qq.get("marks") is None and n not in children and _ancestor_marks(n, by_number) is None:
            add("missing_marks", "warning", "no marks printed for this question or its parent", n)

    # ── paper total vs the rubric ──────────────────────────
    total = paper.get("total_marks")
    if total is None:
        add("no_total", "info", "the paper does not print a total")
    elif tops and all(m is not None for m in top_marks.values()):
        lo, hi, how = _answerable_range(paper, tops, top_marks, by_number)  # type: ignore[arg-type]
        if not (lo - TOLERANCE <= float(total) <= hi + TOLERANCE):
            span = f"{lo:g}" if lo == hi else f"{lo:g}–{hi:g}"
            add("total_marks", "warning", f"paper total {float(total):g}, but {how} gives {span}")

    # ── the course on the paper ────────────────────────────
    # PAU reuses codes for different courses (ISM413 was Entertainment Media): code AND title must match.
    seen = normalize_code(paper.get("code_on_paper"))
    known = {normalize_code(c) for c in (course_code, *aliases, listed_code, *also_codes) if c}
    printed = paper.get("title_on_paper")
    printed = None if generic_title(printed) else printed
    title_ok = bool(course_title and printed and title_similarity(printed, course_title) >= TITLE_MATCH)
    if seen and seen not in known and placeholder_code:
        add("printed_code", "info", f"the paper prints {paper.get('code_on_paper')!r}; this course's code is a placeholder")
    elif seen and seen not in known:
        # A renumbered course still prints its own title; without that (or for a guessed match) a
        # different code means it may be another course.
        sev = "warning" if title_ok and not guessed else "blocking"
        add("code_mismatch", sev, f"paper says {paper.get('code_on_paper')!r}; expected one of {sorted(known)}")
    if course_title and printed and not title_ok:
        add("title_mismatch", "blocking",
            f"the paper's title {printed!r} doesn't match the course {course_title!r}: it may be another course that used this code")
    if guessed and (not seen or placeholder_code) and not printed:
        add("course_unconfirmed", "blocking", "matched to this course from the archive folder name, and the paper prints no code or title to confirm it")
    for note in extraction.get("page_notes") or []:
        add("page_note", "info", str(note))

    for p in problems:
        if p.severity != "info" and (p.key in accepted or p.code in accepted):
            p.severity, p.detail = "info", f"accepted in review: {p.detail}"

    ordered = sorted(by_number.values(), key=lambda q: tuple(x or 0 for x in parse_number(q["number"])))  # type: ignore[union-attr]
    out = [{**q, "parent": expected_parent(q["number"]), "marks": eff[q["number"]]} for q in ordered]
    return Checked(questions=out, problems=problems)


def _ancestor_marks(n: str, by_number: dict[str, dict]) -> float | None:
    p = expected_parent(n)
    while p:
        if p in by_number and by_number[p].get("marks") is not None:
            return by_number[p]["marks"]
        p = expected_parent(p)
    return None


def _check_gaps(numbers: list[str], add) -> None:
    parsed = [(n, parse_number(n)) for n in numbers]
    tops = sorted({p[0] for _, p in parsed if p})
    if tops and tops != list(range(1, tops[-1] + 1)):
        missing = sorted(set(range(1, tops[-1] + 1)) - set(tops))
        add("numbering_gap", "blocking", f"question(s) {', '.join(f'Q{m}' for m in missing)} missing")
    subs: dict[int, set[int]] = {}
    romans: dict[tuple[int, int], set[int]] = {}
    for _, p in parsed:
        if p and p[1]:
            subs.setdefault(p[0], set()).add(p[1])
            if p[2]:
                romans.setdefault((p[0], p[1]), set()).add(p[2])
    for top, letters in subs.items():
        if sorted(letters) != list(range(1, max(letters) + 1)):
            missing = sorted(set(range(1, max(letters) + 1)) - letters)
            add("numbering_gap", "blocking", f"Q{top}: part(s) {', '.join(chr(96 + m) for m in missing)} missing", f"Q{top}")
    for _, p in parsed:
        if p and not p[1] and p[2]:
            romans.setdefault((p[0], 0), set()).add(p[2])
    for (top, sub), rs in romans.items():
        label = f"Q{top}{chr(96 + sub) if sub else ''}"
        if sorted(rs) != list(range(1, max(rs) + 1)):
            add("numbering_gap", "blocking", f"{label}: roman parts not consecutive", label)


def _answerable_range(paper: dict, tops: list[str], marks: dict[str, float], by_number: dict[str, dict]) -> tuple[float, float, str]:
    """The total a candidate can score under the rubric, as a [low, high] range (equal when all
    choices are worth the same)."""
    sections = [s for s in paper.get("sections") or [] if s.get("name")]
    if sections and any(s.get("choose") for s in sections):
        lo = hi = 0.0
        for s in sections:
            qs = sorted(marks[n] for n in tops if (by_number[n].get("section") or "").upper() == str(s["name"]).upper())
            k = s.get("choose")
            if not k or k >= len(qs):
                lo += sum(qs)
                hi += sum(qs)
            else:
                lo += sum(qs[:k])
                hi += sum(qs[-k:])
        return lo, hi, "the section rules"
    answer_total = paper.get("answer_total")
    if answer_total and answer_total < len(tops):
        compulsory = [n for n in paper.get("compulsory") or [] if n in marks]
        rest = sorted(marks[n] for n in tops if n not in compulsory)
        k = max(0, answer_total - len(compulsory))
        base = sum(marks[n] for n in compulsory)
        return base + sum(rest[:k]), base + sum(rest[-k:]) if k else base, f"answering {answer_total} question(s)"
    s = sum(marks[n] for n in tops)
    return s, s, "answering every question"
