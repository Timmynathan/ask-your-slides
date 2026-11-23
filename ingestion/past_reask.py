"""Which stored past-question answers to re-answer, and what each must fix (owner, 23 Nov 2026).

Used by `npm run ingest:past -- --analyse --reask` (always with --estimate first: it costs a little).
  1. Partly covered but no slide cited: the answer had slides to work from but cites none (often a
     "covered" answer stored as partial because it cited nothing).
  2. Multiple choice with no valid answer key (the model wrote a sentence instead of a letter).
  3. Marking schemes too far from the printed marks to scale (past_fix.py lists them).
"""

from __future__ import annotations

from collections import defaultdict

from config import ROOT

TOO_FAR = ROOT / "data" / ".cache" / "past-fix-schemes-too-far.txt"

CITE = "The slides given above are this course's: cite each point you take from them with its [[s:KEY]] marker. If they don't cover part of the question, teach that part in <general> and say so."
MCQ = "answer_key must be exactly one option letter from the options above. If the paper doesn't give enough to choose one, set answer_key to null and say why in the explanation."


def pick(store) -> dict[str, dict[str, str]]:
    """course id → {question id → note}."""
    out: dict[str, dict[str, str]] = defaultdict(dict)
    for r in store.db.execute(
        """select q.id, q.course_id from past_questions q
            where q.relevance = 'partial' and q.model_answer is not null and q.model_answer !~ '\\[\\[s:'
              and exists (select 1 from question_slides s where s.question_id = q.id)"""
    ).fetchall():
        out[str(r["course_id"])][str(r["id"])] = CITE
    for r in store.db.execute(
        """select id, course_id from past_questions
            where type = 'mcq' and options is not null and answer_key is null and model_answer is not null"""
    ).fetchall():
        out[str(r["course_id"])][str(r["id"])] = MCQ
    if TOO_FAR.exists():
        ids = [line.strip() for line in TOO_FAR.read_text().splitlines() if line.strip()]
        if ids:
            for r in store.db.execute("select id, course_id, marks from past_questions where id = any(%s::uuid[])", (ids,)).fetchall():
                note = f"The marking scheme's points must add up to exactly {float(r['marks']):g} marks, the question's printed marks."
                prev = out[str(r["course_id"])].get(str(r["id"]))
                out[str(r["course_id"])][str(r["id"])] = f"{prev} {note}" if prev else note
    return dict(out)
