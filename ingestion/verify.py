"""Proof that ingestion worked (phase 2). Read-only.

  uv run verify.py --course CSC420             # invariants + topic retrieval check (CODE or programme/CODE)
  uv run verify.py --course CSC420 --sample 30 # also print 30 random slides for a spot check
  uv run verify.py --course CSC420 --query "what is a B+ tree"

Checks, per course:
  1. DB matches the manifest: every non-skipped material is there (by lms_cmid) with the right kind,
     topic, order and session; nothing extra; skipped materials are absent; the course row carries
     the catalog fields (department, level, semester, session, aliases).
  2. Every material's page_count equals its slide rows; every slide has an embedding, a chunk,
     a well-formed slide_key, and an image in Storage.
  3. Retrieval sanity: searching the whole course with each topic's title returns a slide from that
     topic in the top 5. Also prints the best in-topic vs out-of-topic similarity — the numbers the
     topic-fallback threshold will be set from.
Exit code 1 if any check in 1–2 fails, or if fewer than 80% of topics pass check 3.
"""

from __future__ import annotations

import argparse
import random
import re
import sys
import textwrap

import embed
from config import DATA
from manifest import load
from store import Store, vector_literal

KEY_RE = re.compile(r"^[A-Z]{2,4}(?:[0-9]{3}|(?:-[A-Z][A-Z0-9]*)+)-[0-9]{2,3}-[0-9]{1,3}$")


def check_course(store: Store, course, failures: list[str]) -> tuple[int, int]:
    cid = store.course_id(course)
    if cid is None:
        failures.append(f"{course.key}: not in the database")
        return 0, 0
    db = store.db
    crow = db.execute("select school, department, level, semester, session, aliases from courses where id = %s", (cid,)).fetchone()
    for field, want in (("school", course.school), ("department", course.department), ("level", course.level),
                        ("semester", course.semester), ("session", course.session), ("aliases", list(course.aliases))):
        if crow[field] != want:
            failures.append(f"{course.key}: course {field} is {crow[field]!r}, course.yaml says {want!r}")
    mats = {r["lms_cmid"]: r for r in db.execute(
        "select m.id, m.lms_cmid, m.kind, m.material_order, m.page_count, t.title as topic, cs.session "
        "from materials m left join topics t on t.id = m.topic_id join course_sessions cs on cs.id = m.course_session_id "
        "where m.course_id = %s", (cid,)).fetchall()}
    for m in course.materials:
        row = mats.get(m.cmid)
        if row is None:
            failures.append(f"{course.key} {m.order:02d}: missing from DB ({m.rel_file})")
            continue
        for field, want in (("kind", m.kind), ("topic", m.topic), ("material_order", m.order), ("session", course.session)):
            if row[field] != want:
                failures.append(f"{course.key} {m.order:02d}: {field} is {row[field]!r}, manifest says {want!r}")
    extra = set(mats) - {m.cmid for m in course.materials}
    for cmid in extra:
        failures.append(f"{course.key}: material lms_cmid {cmid} is in the DB but not in the manifest")
    for s in course.skipped:
        if s.get("lms_cmid") in mats:
            failures.append(f"{course.key}: skipped material {s.get('lms_cmid')} was ingested")

    topics_db = {r["title"] for r in db.execute("select title from topics where course_id = %s", (cid,)).fetchall()}
    if topics_db != {t.title for t in course.topics}:
        failures.append(f"{course.key}: topics differ from manifest: {sorted(topics_db ^ {t.title for t in course.topics})}")

    slides = db.execute(
        "select s.material_id, s.slide_number, s.slide_key, s.image_path, s.view is not null as has_view, s.embedding is not null as has_vec, "
        "length(s.chunk_text) as chunk_len from slides s where s.course_id = %s", (cid,)).fetchall()
    per_material: dict = {}
    for s in slides:
        per_material.setdefault(s["material_id"], []).append(s)
        if not s["has_vec"]:
            failures.append(f"{s['slide_key']}: no embedding")
        if not s["chunk_len"]:
            failures.append(f"{s['slide_key']}: empty chunk")
        if not KEY_RE.match(s["slide_key"]):
            failures.append(f"{s['slide_key']}: malformed slide_key")
        # Notebook cells and code have no page image: the viewer shows their `view` (PRD F11).
        if not s["image_path"] and not s["has_view"]:
            failures.append(f"{s['slide_key']}: neither a page image nor a view to show")
    images = set(store.list_course_images(cid))
    for row in mats.values():
        rows = per_material.get(row["id"], [])
        if len(rows) != row["page_count"]:
            failures.append(f"{course.key} {row['material_order']:02d}: page_count {row['page_count']} but {len(rows)} slide rows")
        if sorted(r["slide_number"] for r in rows) != list(range(1, len(rows) + 1)):
            failures.append(f"{course.key} {row['material_order']:02d}: slide numbers are not 1..{len(rows)}")
    misplaced = [s["image_path"] for s in slides if s["image_path"] and not s["image_path"].startswith(f"{cid}/")]
    if misplaced:
        failures.append(f"{course.key}: {len(misplaced)} images not under the course id yet (run ingest), e.g. {misplaced[:2]}")
    missing = [s["image_path"] for s in slides if s["image_path"] and s["image_path"] not in images]
    if missing:
        failures.append(f"{course.key}: {len(missing)} slide images missing in Storage, e.g. {missing[:3]}")
    orphans = images - {s["image_path"] for s in slides}
    if orphans:
        failures.append(f"{course.key}: {len(orphans)} images in Storage with no slide row, e.g. {sorted(orphans)[:3]}")
    return len(mats), len(slides)


def search(store: Store, course_id: str, query: str, k: int = 5, topic_id: str | None = None) -> list[dict]:
    vec = vector_literal(embed.embed_query(query))
    return store.db.execute(
        "select slide_key, material_title, material_kind, topic_title, title, similarity, score "
        "from match_slides(%s, %s::extensions.vector, %s, %s, %s)", (course_id, vec, query, k, topic_id)).fetchall()


def topic_check(store: Store, course) -> tuple[int, int]:
    cid = store.course_id(course)
    topic_ids = {r["title"]: str(r["id"]) for r in store.db.execute(
        "select id, title from topics where course_id = %s", (cid,)).fetchall()}
    passed = 0
    print(f"\n  Topic retrieval (query = topic title, whole-course search, top 5):")
    print(f"  {'topic':45} {'hit':4} {'best sim in topic':>18} {'best sim other topics':>22}")
    for t in course.topics:
        hits = search(store, cid, t.title, 5)
        ok = any(h["topic_title"] == t.title for h in hits)
        passed += ok
        in_topic = search(store, cid, t.title, 5, topic_ids[t.title])
        best_in = max((h["similarity"] or 0 for h in in_topic), default=0)
        best_out = max((h["similarity"] or 0 for other, oid in topic_ids.items() if other != t.title
                        for h in search(store, cid, t.title, 3, oid)), default=0)
        print(f"  {t.title[:45]:45} {'yes' if ok else 'NO':4} {best_in:18.3f} {best_out:22.3f}")
    return passed, len(course.topics)


def print_sample(store: Store, course, n: int) -> None:
    rows = store.db.execute(
        "select s.slide_key, m.title as material, m.kind, s.title, s.body_text, s.visual_description, s.speaker_notes, s.image_path "
        "from slides s join materials m on m.id = s.material_id where s.course_id = %s",
        (store.course_id(course),)).fetchall()
    random.seed(7)
    print(f"\n  Spot check: {min(n, len(rows))} random slides of {len(rows)}")
    for r in random.sample(rows, min(n, len(rows))):
        print(f"\n  [{r['slide_key']}] {r['material']} ({r['kind']}) — {r['title'] or '(no title)'}")
        print(textwrap.indent(textwrap.shorten(r["body_text"] or "(no text)", 300), "    text:   "))
        if r["visual_description"]:
            print(textwrap.indent(textwrap.shorten(r["visual_description"], 300), "    visual: "))
        if r["speaker_notes"]:
            print(textwrap.indent(textwrap.shorten(r["speaker_notes"], 200), "    notes:  "))
        print(f"    image:  {store.signed_url(r['image_path'], 3600)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course", action="append", help="CODE, programme/CODE or institution/programme/CODE (repeatable); default: all in the DB")
    ap.add_argument("--sample", type=int, default=0, help="print N random slides")
    ap.add_argument("--query", action="append", default=[], help="run a search and print the top 5")
    args = ap.parse_args()

    courses = load(DATA)
    store = Store()
    try:
        in_db = {f"{r['institution']}/{r['programme']}/{r['code']}"
                 for r in store.db.execute("select institution, programme, code from courses").fetchall()}
        if args.course:
            selected = [c for c in courses if any(c.matches(s) for s in args.course)]
        else:
            selected = [c for c in courses if c.key in in_db]
        failures: list[str] = []
        weak: list[str] = []
        for course in selected:
            n_mat, n_slides = check_course(store, course, failures)
            print(f"{course.key}: {n_mat} materials, {n_slides} slides in DB")
            if n_slides:
                passed, total = topic_check(store, course)
                print(f"  → {passed}/{total} topics retrieved by their own title")
                if passed < 0.8 * total:
                    weak.append(f"{course.key}: only {passed}/{total} topics retrieved by their own title")
            for q in args.query:
                print(f"\n  Query: {q}")
                for h in search(store, store.course_id(course), q, 5):
                    print(f"    {h['slide_key']:14} sim {h['similarity'] or 0:.3f}  {h['material_kind']:8} "
                          f"{(h['topic_title'] or 'course-level')[:28]:28} {h['title'] or ''}")
            if args.sample:
                print_sample(store, course, args.sample)
        print()
        for f in failures + weak:
            print(f"FAIL {f}")
        if failures or weak:
            return 1
        print(f"PASS: {len(selected)} course(s) match the manifest; slides, embeddings and images are complete; topic retrieval OK.")
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    sys.exit(main())
