"""Golden checks for past-paper extraction (PRD §15, F10).

Compares the latest extraction of each paper (data/.reports/past_papers/<CODE>-<name>.json, written
by past_papers.py) with a hand transcription in data/pau/_evals/past_questions/*.yaml:

- the same question numbers, no more and no fewer;
- the same marks for every entry;
- text similarity (word level, Markdown and punctuation ignored) ≥ the entry's text_min (default 0.9);
- the paper's rubric (answer_total, compulsory) and total_marks.

    npm run check:past
"""

from __future__ import annotations

import json
import re
import sys
from difflib import SequenceMatcher

import yaml
from config import ROOT

GOLDEN = ROOT / "data" / "pau" / "_evals" / "past_questions"
DUMPS = ROOT / "data" / ".reports" / "past_papers"
DEFAULT_MIN = 0.9


def words(text: str) -> list[str]:
    t = (text or "").lower().replace("’", "'").replace("“", '"').replace("”", '"')
    t = re.sub(r"\[diagram:|\]|[|*#`>_]", " ", t)
    return re.findall(r"[a-z0-9$%+.'/-]+", t)


def similarity(a: str, b: str) -> float:
    wa, wb = [w.strip(".'") for w in words(a)], [w.strip(".'") for w in words(b)]
    wa, wb = [w for w in wa if w], [w for w in wb if w]
    if not wa and not wb:
        return 1.0
    return SequenceMatcher(None, wa, wb, autojunk=False).ratio()


def compare(golden: dict, extracted: dict) -> list[str]:
    """Problems found (empty = pass). `extracted` is a dump: {"raw": {...paper...}, "checked": [questions]}."""
    fails: list[str] = []
    got = {q["number"]: q for q in extracted["checked"]}
    want = {q["number"]: q for q in golden["questions"]}
    for n in sorted(set(want) - set(got)):
        fails.append(f"{n}: missing")
    for n in sorted(set(got) - set(want)):
        fails.append(f"{n}: extra entry")
    for n, w in want.items():
        g = got.get(n)
        if not g:
            continue
        if (w.get("marks") is None) != (g.get("marks") is None) or (w.get("marks") is not None and abs(float(w["marks"]) - float(g["marks"])) > 0.01):
            fails.append(f"{n}: marks {g.get('marks')} ≠ {w.get('marks')}")
        need = float(w.get("text_min", DEFAULT_MIN))
        sim = similarity(w.get("text") or "", g.get("text") or "")
        if sim < need:
            fails.append(f"{n}: text similarity {sim:.2f} < {need:.2f}")
    paper = extracted["raw"].get("paper") or {}
    for key in ("answer_total", "compulsory", "total_marks"):
        if key in golden and paper.get(key) != golden[key] and not (key == "compulsory" and sorted(paper.get(key) or []) == sorted(golden[key])):
            fails.append(f"paper {key}: {paper.get(key)!r} ≠ {golden[key]!r}")
    return fails


def main() -> int:
    files = sorted(GOLDEN.glob("*.yaml"))
    if not files:
        print(f"No golden transcriptions in {GOLDEN}")
        return 1
    failed = 0
    for f in files:
        golden = yaml.safe_load(f.read_text())
        dump = DUMPS / f"{f.stem}.json"
        if not dump.is_file():
            print(f"SKIP {f.stem}: not extracted yet (run npm run ingest:past)")
            continue
        extracted = json.loads(dump.read_text())
        fails = compare(golden, extracted)
        n = len(golden["questions"])
        if fails:
            failed += 1
            print(f"FAIL {f.stem} ({extracted.get('model')}): {len(fails)} problem(s) over {n} entries")
            for line in fails:
                print(f"     - {line}")
        else:
            sims = [similarity(q.get("text") or "", next(x for x in extracted["checked"] if x["number"] == q["number"]).get("text") or "")
                    for q in golden["questions"]]
            print(f"PASS {f.stem} ({extracted.get('model')}): {n} entries, numbers and marks exact, text similarity min {min(sims):.2f}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
