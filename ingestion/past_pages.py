"""Clean page images of every past paper for the viewer (PRD F10, owner 14 Nov 2026).

For each paper file (once per file: SEN's copies of CS papers share the work):
  render pages (turned upright) → vision pass marks printed blocks + personal details (Batch API,
  cached) → paper_clean.clean_blocks → WebP → Storage at <course_id>/past/<paper_id>/<n>.webp, plus
  pages.json listing the page numbers to show (answer-key pages are left out).
Clean PNGs are also kept in data/.cache/paper_pages/<file hash>/ for review.

  npm run ingest:past:pages            # estimate, then asks
  npm run ingest:past:pages -- --yes   # no question (cached pages are free)
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import batch
from config import BUCKET, CACHE, DATA, PAST_Q_MODEL
from paper_clean import clean_blocks, scrub_ids, to_webp
from past_ink import build_params, to_fractions
from past_papers import render_pages
from store import Store

OUT = CACHE / "paper_pages"
# "The paper includes answer keys…", "Paper has typed sample answers…" (not "No marking guide or model
# solutions present").
ANSWERS_RE = re.compile(r"\b(includes|has|contains|with)\b[^.]{0,20}\b(answer keys?|sample answers|model answers|marking guid(e|ance))", re.I)
OUT_TOKENS = 450  # average reply in the pilot (190–800)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--no-upload", action="store_true")
    args = ap.parse_args()

    store = Store()
    papers = store.db.execute("select id, course_id, source_file, file_hash, problems from past_papers order by source_file").fetchall()
    by_hash: dict[str, list[dict]] = {}
    for p in papers:
        by_hash.setdefault(p["file_hash"], []).append(p)
    print(f"{len(papers)} paper(s), {len(by_hash)} distinct file(s)")

    # Papers with answers written into them (an answer key, sample answers) are never shown: the
    # extraction noted it; the vision pass only catches whole answer pages.
    hidden = {p["file_hash"] for p in papers if ANSWERS_RE.search(" ".join(x.get("detail", "") for x in p["problems"] or []))}
    # The paper's own printed text: long numbers in it (a phone number in a question) are not IDs.
    question_text: dict[str, str] = {}
    for q in store.db.execute("select p.file_hash, string_agg(q.text, ' ') t from past_questions q join past_papers p on p.id = q.paper_id group by 1").fetchall():
        question_text[q["file_hash"]] = q["t"] or ""
    pages: dict[str, list[bytes]] = {}
    requests: dict[str, dict] = {}
    sizes: dict[str, tuple[int, int]] = {}
    for h, rows in by_hash.items():
        jpegs = [jpg for jpg, _, _ in render_pages(DATA / rows[0]["source_file"])]
        pages[h] = jpegs
        for i, jpg in enumerate(jpegs, 1):
            params, size = build_params(jpg)
            requests[f"{h[:20]}-{i}"] = params
            sizes[f"{h[:20]}-{i}"] = size
    todo = {k: p for k, p in requests.items() if not batch.cached(p)}
    tokens_in = sum(2000 + 1100 for _ in todo)  # prompt + one page image (pilot: ~3,000–3,400 in)
    cost = batch.batch_cost(PAST_Q_MODEL, tokens_in, OUT_TOKENS * len(todo))
    print(f"{len(requests)} page(s), {len(todo)} need the model ({PAST_Q_MODEL}). Estimate ≈ ${cost:.2f}")
    if todo and not args.yes and input("Submit? [y/N] ").strip().lower() != "y":
        print("Cancelled.")
        return

    replies = batch.run(requests, "paper pages")
    spent = sum(batch.batch_cost(PAST_Q_MODEL, r.input_tokens, r.output_tokens) for r in replies.values() if not r.cached)
    report = []
    for h, rows in by_hash.items():
        out_dir = OUT / h[:20]
        out_dir.mkdir(parents=True, exist_ok=True)
        shown: list[int] = []
        webps: dict[int, bytes] = {}
        personal = 0
        for i, jpg in enumerate(pages[h], 1):
            key = f"{h[:20]}-{i}"
            r = replies.get(key)
            if not r or r.error or not r.text:
                report.append(f"FAILED {rows[0]['source_file']} page {i}: {r.error if r else 'no reply'}")
                continue
            ink = to_fractions(json.loads(r.text), *sizes[key])
            (out_dir / f"{i}.json").write_text(json.dumps(ink))
            if ink["answer_page"]:
                report.append(f"answer page left out: {rows[0]['source_file']} page {i}")
                continue
            personal += len(ink["personal"])
            page = clean_blocks(jpg, ink)
            page, ids = scrub_ids(page, question_text.get(h, ""))
            personal += ids
            import cv2

            cv2.imwrite(str(out_dir / f"{i}.png"), page)
            webps[i] = to_webp(page)
            shown.append(i)
        if personal:
            report.append(f"personal details whited out ({personal}): {rows[0]['source_file']}")
        if h in hidden:
            report.append(f"not shown (answers written into the paper): {rows[0]['source_file']}")
            shown, webps = [], {}
        if args.no_upload:
            continue
        for row in rows:
            base = f"{row['course_id']}/past/{row['id']}"
            for i, data in webps.items():
                put(store, f"{base}/{i}.webp", data, "image/webp")
            put(store, f"{base}/pages.json", json.dumps({"pages": shown}).encode(), "application/json")
            if not shown:  # nothing to show: take down any images from an earlier run
                old = [f"{base}/{i}.webp" for i in range(1, len(pages[h]) + 1)]
                store.http.request("DELETE", f"/object/{BUCKET}", json={"prefixes": old})

    print("\n".join(report))
    print(f"Done: {sum(len(v) for v in pages.values())} page(s). Spent ≈ ${spent:.2f}. Review images in {OUT}")


def put(store: Store, path: str, data: bytes, kind: str) -> None:
    r = store.http.post(f"/object/{BUCKET}/{path}", content=data, headers={"Content-Type": kind, "x-upsert": "true", "cache-control": "3600"})
    if r.status_code >= 300:
        raise RuntimeError(f"upload {path} failed: {r.status_code} {r.text[:200]}")


if __name__ == "__main__":
    main()
