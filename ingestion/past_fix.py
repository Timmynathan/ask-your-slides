"""Free fixes to stored past-question answers (owner, 23 Nov 2026: the analysis report's warnings).

  uv run past_fix.py              # preview: counts and samples, nothing written
  uv run past_fix.py --apply      # write the fixes

1. Topics. A question the analysis linked to no topic (or to a topic number that doesn't exist) gets the
   topic of the slides found for it: each slide's lecture scores 1/rank, the best lecture wins. A
   question with no slides keeps no topic. Then each course's roll-up runs, so a question with parts
   gets the union of its parts' topics and the "asked in N papers" counts include them.
2. Marking schemes. A scheme whose points don't add up to the question's printed marks is scaled to
   them, keeping its proportions, in half marks; any rounding difference goes on the largest point.
No model calls: costs nothing.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
import sys
from collections import defaultdict

import past_analysis as pa
from config import ROOT
from store import Store

TOO_FAR = ROOT / "data" / ".cache" / "past-fix-schemes-too-far.txt"


def topic_fixes(store) -> dict[str, tuple[str, str]]:
    """question id → (topic id, topic title), for analysed questions with no topic and some slides."""
    rows = store.db.execute(
        """select q.id as question_id, m.topic_id, t.title, qs.rank
             from past_questions q
             join question_slides qs on qs.question_id = q.id
             join slides s on s.id = qs.slide_id
             join materials m on m.id = s.material_id
             join topics t on t.id = m.topic_id
            where q.model_answer is not null
              and not exists (select 1 from question_topics qt where qt.question_id = q.id)"""
    ).fetchall()
    score: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    title: dict[str, str] = {}
    for r in rows:
        score[r["question_id"]][r["topic_id"]] += 1.0 / max(1, r["rank"] or 1)
        title[r["topic_id"]] = r["title"]
    return {q: (best := max(s, key=s.get), title[best]) for q, s in score.items()}


TOTAL_ROW = re.compile(r"^\s*(?:total|full marks|overall|maximum)\b", re.I)
# Scaling is for small slips (a point too many, a half mark off). A bigger gap means the marks were
# misread or the scheme is for another part: those are left for a re-answer (past_reask.py).
SCALE_MIN, SCALE_MAX = 0.6, 1.6


def scheme_fixes(store) -> tuple[dict[str, list[dict]], list[str]]:
    """(question id → the fixed scheme, ids too far off to scale) for schemes that don't add up to
    the printed marks. A "Total" row counted as a point is dropped first."""
    rows = store.db.execute(
        "select id, marks, marking_scheme from past_questions where marks is not null and marks > 0 and marking_scheme is not null"
    ).fetchall()
    out, too_far = {}, []
    for r in rows:
        scheme = r["marking_scheme"] or []
        if not isinstance(scheme, list) or not scheme:
            continue
        # A "Total: 6" row: short, starts with Total, and worth the whole question.
        def is_total(p) -> bool:
            text = str(p.get("point") or "") if isinstance(p, dict) else ""
            try:
                worth = float(p.get("marks") or 0)
            except (TypeError, ValueError):
                return False
            return len(text) <= 30 and bool(TOTAL_ROW.match(text)) and abs(worth - float(r["marks"])) < 0.01
        kept = [p for p in scheme if not is_total(p)]
        if kept and len(kept) < len(scheme):
            scheme = kept
        try:
            pts = [float(p.get("marks") or 0) for p in scheme]
        except (TypeError, ValueError, AttributeError):
            continue
        total, target = sum(pts), float(r["marks"])
        if total <= 0:
            continue
        if abs(total - target) < 0.01:
            if len(scheme) < len(r["marking_scheme"]):
                out[r["id"]] = scheme  # only the Total row was wrong
            continue
        if not SCALE_MIN <= target / total <= SCALE_MAX:
            too_far.append(r["id"])
            continue
        # Largest remainder, in half marks: each point gets its share rounded down, then the half marks
        # left over go to the points that lost most to rounding.
        units = target * 2
        if abs(units - round(units)) > 0.01:
            continue  # printed marks not in half marks: leave it
        raw = [p * units / total for p in pts]
        base = [int(x) for x in raw]
        left = int(round(units)) - sum(base)
        for k in sorted(range(len(raw)), key=lambda k: raw[k] - base[k], reverse=True)[:left]:
            base[k] += 1
        new = [b / 2 for b in base]
        if abs(sum(new) - target) >= 0.01 or any(v <= 0 for v in new):
            too_far.append(r["id"])
            continue
        out[r["id"]] = [{**p, "marks": (int(v) if v == int(v) else v)} for p, v in zip(scheme, new)]
    return out, too_far


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the fixes (default: preview only)")
    args = ap.parse_args()
    store = Store()

    topics = topic_fixes(store)
    schemes, too_far = scheme_fixes(store)
    print(f"Topics: {len(topics)} question(s) without a topic get one from their slides.")
    for qid, (_, t) in list(topics.items())[:5]:
        text = store.db.execute("select text from past_questions where id = %s", (qid,)).fetchone()["text"]
        print(f"  → {t[:50]:50}  {(text or '').replace(chr(10), ' ')[:80]}")
    print(f"Marking schemes: {len(schemes)} fixed (Total rows dropped, small slips scaled); {len(too_far)} too far off, left for a re-answer.")
    for qid, new in list(schemes.items())[:4]:
        r = store.db.execute("select marks, marking_scheme from past_questions where id = %s", (qid,)).fetchone()
        print(f"  {float(r['marks']):g} marks: {[p.get('marks') for p in r['marking_scheme']]} → {[p['marks'] for p in new]}")
    if too_far:
        Path(TOO_FAR).write_text("\n".join(str(i) for i in too_far) + "\n")
        print(f"  (ids written to {TOO_FAR})")
    if not args.apply:
        print("\nPreview only: nothing written. Add --apply to write.")
        return 0

    courses = set()
    with store.db.transaction():
        for qid, (tid, _) in topics.items():
            store.db.execute("insert into question_topics (question_id, topic_id) values (%s, %s) on conflict do nothing", (qid, tid))
        for qid, new in schemes.items():
            store.db.execute("update past_questions set marking_scheme = %s where id = %s", (json.dumps(new), qid))
        for qid in list(topics) + list(schemes):
            courses.add(store.db.execute("select course_id from past_questions where id = %s", (qid,)).fetchone()["course_id"])
    for cid in courses:
        pa.roll_up(store, cid)
    print(f"\nWritten: {len(topics)} topic link(s), {len(schemes)} scheme(s); roll-up redone for {len(courses)} course(s).")
    store.db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
