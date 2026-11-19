"""Haiku vs Sonnet on past-paper extraction (owner, Nov 2026): do the validator's flags catch
Haiku's bad reads?

    npm run ingest:past:bakeoff -- --list     # show the 20 papers picked, nothing sent
    npm run ingest:past:bakeoff               # estimate (free), ask, run both models, report

Picks 20 papers not stored yet (one per distinct file, ≤ MAX_PAGES pages), 5 of each kind:
  typed     every page has a text layer
  clean     scanned, A4-shaped, Tesseract reads many words per page
  photo     scanned, not A4-shaped (a phone photo) or few words per page
  maths     2 economics (ECO), 2 engineering (GET, MEE, EEE, MCE, MCT), 1 finance (FIN)
Only 100-300 level (the new papers), and never a paper the content filter blocked before.
The pick is saved to data/.reports/bakeoff/selection.yaml and reused on the next run (edit it to
change the papers).

Both models get the exact request the pipeline sends (only "model" differs), through the Batches API.
The Haiku replies are cached, so phase 2 (Haiku for everything) gets these 20 for $0. Nothing is
written to the database.

Sonnet is the reference: past_golden.compare (same question numbers, same marks, text similarity
≥ 0.9, same rubric). Per paper: does Haiku match, and did past_validate flag Haiku's reading?
  ok           match, not flagged
  caught       differs, flagged        (the flags work)
  MISSED       differs, not flagged    (a bad read students would see)
  false alarm  matches, flagged
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import datetime
from pathlib import Path

import batch
import pymupdf
import past_papers as pp
import yaml
from config import DATA
from manifest import load
from past_golden import compare
from past_validate import apply_review, check
from store import Store

MODELS = {"haiku": "claude-haiku-5-5", "sonnet": "claude-sonnet-5-5"}
OUT = pp.REPORTS / "bakeoff"
SELECTION = OUT / "selection.yaml"
PER_KIND = 5
MAX_PAGES = 6
MAX_USD = 1.50  # refuse to submit above this (owner's ~$1 plan, with margin)
MATHS = {"ECO": 2, "ENG": 2, "FIN": 1}  # how many of each in the maths group
ENGINEERING = ("GET", "MEE", "EEE", "MCE", "MCT")
SKIP = {"pau/smss/business-administration/400-level/BUA401/past_papers/2024-2025_ca.pdf"}  # blocked by the content filter

# Problems about reading the paper. Course-match problems (title_mismatch, course_unconfirmed) are
# about which course the paper belongs to, not about the read, and are reported apart.
READ_FLAGS = {"no_questions", "numbering_format", "numbering_gap", "duplicate_number", "missing_parent", "wrong_parent",
              "bad_type", "empty_text", "unreadable", "low_confidence", "mcq_options",
              "medium_confidence", "missing_marks", "subparts_sum", "total_marks"}


def features(course, paper) -> dict:
    """How the file looks: text-layer pages, shape, and Tesseract words per scanned page (cached by the estimate)."""
    import hashlib

    h = hashlib.sha256(paper.file.read_bytes()).hexdigest()
    with pymupdf.open(paper.file) as doc:
        n = len(doc)
        text = [len(pg.get_text("text").strip()) > 40 for pg in doc]
        ratios = [max(pg.rect.width, pg.rect.height) / max(1, min(pg.rect.width, pg.rect.height)) for pg in doc]
    cache = pp.ORIENTATION_CACHE / f"{h}.json"
    words = [max(v["words_as_is"], v["words_turned"]) for v in json.loads(cache.read_text()).values()] if cache.is_file() else []
    return {"hash": h, "pages": n, "typed": all(text), "scanned": not any(text),
            "a4": all(abs(r - 1.414) < 0.08 for r in ratios), "words": sum(words) / len(words) if words else None,
            "maths": maths_kind(course.code)}


def maths_kind(code: str) -> str | None:
    c = code.upper()
    if c.startswith(ENGINEERING):
        return "ENG"
    return next((k for k in ("ECO", "FIN") if c.startswith(k)), None)


def pick(courses, store) -> list[dict]:
    stored = {(str(r["course_id"]), r["source_file"]) for r in store.db.execute("select course_id, source_file from past_papers").fetchall()}
    seen, cands = set(), []
    for c in courses:
        cid = str(store.course_id(c))
        if c.level > 300:
            continue
        for p in c.past_papers:
            if (cid, p.rel_file) in stored or p.rel_file in SKIP:
                continue
            f = features(c, p)
            if f["hash"] in seen or f["pages"] > MAX_PAGES:
                continue
            seen.add(f["hash"])
            cands.append({"course": c.key, "code": c.code, "file": p.rel_file, **f})
    rng = random.Random(20261120)
    chosen: list[dict] = []

    def take(kind: str, pool: list[dict], n: int = PER_KIND) -> None:
        # One at a time, preferring a course not picked yet (stable: keeps the pool's order otherwise).
        for _ in range(n):
            files, codes = {y["file"] for y in chosen}, {y["code"] for y in chosen}
            left = [x for x in pool if x["file"] not in files]
            if not left:
                return
            x = min(left, key=lambda x: x["code"] in codes)
            chosen.append({**x, "kind": kind})

    scanned = [x for x in cands if x["scanned"] and x["words"] is not None and not x["maths"]]
    rng.shuffle(cands)
    for k, n in MATHS.items():
        take("maths", [x for x in cands if x["maths"] == k], n)
    take("typed", [x for x in cands if x["typed"] and not x["maths"]])
    take("clean", sorted([x for x in scanned if x["a4"]], key=lambda x: -x["words"])[:15])
    take("photo", sorted([x for x in scanned if not x["a4"] or x["words"] < 40], key=lambda x: (x["a4"], x["words"]))[:15])
    return [{k: x[k] for k in ("kind", "course", "code", "file", "pages", "words", "a4")} for x in chosen]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--list", action="store_true", help="show the papers picked and stop")
    ap.add_argument("--yes", action="store_true", help="don't ask before submitting")
    args = ap.parse_args()

    courses = load(DATA)
    by_key = {c.key: c for c in courses}
    if SELECTION.is_file():
        sel = yaml.safe_load(SELECTION.read_text())
        print(f"Using {SELECTION} (delete it to pick again).")
    else:
        store = Store()
        sel = pick(courses, store)
        store.close()
        OUT.mkdir(parents=True, exist_ok=True)
        SELECTION.write_text(yaml.safe_dump(sel, sort_keys=False, allow_unicode=True))
    for s in sel:
        w = "" if s["words"] is None else f"{s['words']:.0f} words/page"
        print(f"  {s['kind']:<6} {s['code']:<8} {s['pages']}p {'A4' if s['a4'] else 'not A4':<7} {w:<15} {s['file']}")
    if args.list:
        return 0

    jobs = []
    for s in sel:
        c = by_key[s["course"]]
        p = next(p for p in c.past_papers if p.rel_file == s["file"])
        jobs.append((s, pp.make_job(c, p)))
    requests = {f"{m}-{j.custom_id}": {**j.params, "model": model} for _, j in jobs for m, model in MODELS.items()}

    total = 0.0
    for m, model in MODELS.items():
        tin = tout = 0
        for _, j in jobs:
            params = requests[f"{m}-{j.custom_id}"]
            if batch.cached(params):
                continue
            tin += batch.count_input_tokens(params)
            tout += 1500 * j.pages + 4000
        cost = batch.batch_cost(model, tin, tout)
        total += cost
        print(f"{model}: {tin:,} in, ~{tout:,} out ≈ ${cost:.2f}")
    print(f"Total ≈ ${total:.2f} (Batches API; Haiku's replies are reused by phase 2 for $0)")
    if total > MAX_USD:
        print(f"Over ${MAX_USD:.2f}: not submitting. Edit {SELECTION} (fewer or shorter papers).")
        return 1
    if total and not args.yes and input("\nSubmit? [y/N] ").strip().lower() != "y":
        print("Cancelled.")
        return 1

    replies = batch.run(requests, label="bakeoff")
    spent = {m: 0.0 for m in MODELS}
    rows, dumps = [], {}
    for s, j in jobs:
        got = {}
        for m, model in MODELS.items():
            r = replies[f"{m}-{j.custom_id}"]
            if not r.cached:
                spent[m] += batch.batch_cost(model, r.input_tokens, r.output_tokens)
            if r.error or not r.text:
                got[m] = (None, None, r.error or "empty reply")
                continue
            raw = json.loads(r.text)
            extraction, accepted = apply_review(raw, j.review)
            checked = check(extraction, course_code=j.course.code, aliases=j.course.aliases, listed_code=j.paper.code_on_paper,
                            accepted=accepted, course_title=j.course.title, guessed=bool(j.paper.review))
            got[m] = (raw, checked, None)
            dump = OUT / m / f"{j.course.code}-{Path(j.paper.rel_file).stem}.json"
            dump.parent.mkdir(parents=True, exist_ok=True)
            dump.write_text(json.dumps({"model": model, "raw": raw, "checked": checked.questions,
                                        "problems": [p.as_dict() for p in checked.problems]}, indent=1, ensure_ascii=False))
            dumps[(s["file"], m)] = dump
        rows.append((s, j, got))

    lines = [f"# Past papers bake-off: Haiku vs Sonnet — {datetime.now():%Y-%m-%d %H:%M}", "",
             f"Spent: Haiku ${spent['haiku']:.3f}, Sonnet ${spent['sonnet']:.3f}. Sonnet is the reference "
             "(same numbers, same marks, text similarity ≥ 0.9, same rubric).", "",
             "| Kind | Paper | Pages | Haiku vs Sonnet | Haiku status | Haiku reading flags | Course flags | Verdict |",
             "|---|---|---|---|---|---|---|---|"]
    tally: dict[str, int] = {}
    details = []
    for s, j, got in rows:
        name = f"{j.course.code} {Path(j.paper.rel_file).name}"
        (h_raw, h_chk, h_err), (s_raw, s_chk, s_err) = got["haiku"], got["sonnet"]
        if h_err or s_err:
            verdict = "error"
            lines.append(f"| {s['kind']} | {name} | {j.pages} | haiku: {h_err or 'ok'}; sonnet: {s_err or 'ok'} | | | | error |")
            tally[verdict] = tally.get(verdict, 0) + 1
            continue
        ref = {"questions": [{"number": q["number"], "marks": q.get("marks"), "text": q.get("text") or ""} for q in s_chk.questions]}
        paper = s_raw.get("paper") or {}
        ref.update({k: paper.get(k) for k in ("answer_total", "compulsory", "total_marks")})
        fails = compare(ref, {"raw": h_raw, "checked": h_chk.questions})
        read = sorted({p.code for p in h_chk.problems if p.code in READ_FLAGS})
        course = sorted({p.code for p in h_chk.problems if p.severity == "blocking" and p.code not in READ_FLAGS})
        blocking_read = any(p.severity == "blocking" and p.code in READ_FLAGS for p in h_chk.problems)
        flagged = bool(read)
        verdict = ("ok" if not flagged else "false alarm") if not fails else ("caught" if flagged else "MISSED")
        tally[verdict] = tally.get(verdict, 0) + 1
        status = h_chk.status + (" (reading)" if blocking_read else " (course match only)" if h_chk.status == "needs_review" else "")
        match = "match" if not fails else f"{len(fails)} difference(s) over {len(ref['questions'])} entries"
        lines.append(f"| {s['kind']} | {name} | {j.pages} | {match} | {status} | {', '.join(read) or '—'} | "
                     f"{', '.join(course) or '—'} | **{verdict}** |")
        if fails:
            details += [f"### {name} ({verdict})", "", f"Sonnet `{dumps[(s['file'], 'sonnet')]}` · Haiku `{dumps[(s['file'], 'haiku')]}`", "",
                        *[f"- {f}" for f in fails[:12]], *([f"- … {len(fails) - 12} more"] if len(fails) > 12 else []), ""]
    summary = "**Summary:** " + ", ".join(f"{k} {v}" for k, v in sorted(tally.items()))
    lines += ["", summary, "",
              "Reading flags = " + ", ".join(sorted(READ_FLAGS)) + ". Course flags (title_mismatch, course_unconfirmed) "
              "are about which course a paper belongs to, not the read.", "", "## Differences", "", *details]
    report = pp.REPORTS / f"past-bakeoff-{datetime.now():%Y-%m-%d-%H%M}.md"
    report.write_text("\n".join(lines))
    batch.log_spend("bakeoff", {MODELS[m]: v for m, v in spent.items()})
    print("\n".join(lines[4:4 + len(rows) + 1]))
    print(f"\n{summary}")
    print(f"Report: {report}\nSpent: Haiku ${spent['haiku']:.3f}, Sonnet ${spent['sonnet']:.3f}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
