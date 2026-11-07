"""Ingestion CLI: data/manifest.yaml → Supabase (PRD §9).

  uv run ingest.py --course CSC420 --dry-run   # validate + plan, no API calls, no writes
  uv run ingest.py --course CSC420             # ingest one course
  uv run ingest.py                             # every course in the manifest
  uv run ingest.py --remove-course CSC420      # delete a course, its rows and images

Per material (identity = manifest lms_cmid):
  new / file changed   → convert, render, extract, vision, embed, upload, replace rows
  metadata changed     → (topic, kind, title) re-chunk and re-embed only; no render, no vision
  unchanged            → skipped
  gone from manifest   → deleted (rows + images); kind: skipped is never ingested
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import embed
import pdf_extract
import pptx_extract
import vision
from chunks import build_chunk, image_path, looks_garbled, sanitize, slide_key, unit
from config import DATA, PIPELINE_VERSION, VISION_MODEL, VISION_USD_PER_MTOK
from manifest import Course, ManifestError, Material, load, title_from_filename
from store import SlideRow, Store

MIN_TEXT_CHARS = 40  # PRD §9.2: shorter than this is probably a scanned slide


@dataclass
class Stats:
    materials: dict[str, int] = field(default_factory=lambda: {"new": 0, "changed": 0, "metadata": 0, "unchanged": 0, "removed": 0})
    pages: int = 0
    vision_calls: int = 0
    vision_cached: int = 0
    transcribed: int = 0
    refusals: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    image_bytes: int = 0


@dataclass
class PagePlan:
    number: int
    title: str | None
    body: str
    notes: str | None
    png: bytes
    reason: str | None  # why it needs extra work (None = text layer is enough)
    mode: str  # 'describe' (Claude vision) | 'transcribe' (local OCR)
    pdf: Path


def content_hash(m: Material) -> str:
    h = hashlib.sha256(f"v{PIPELINE_VERSION}|order {m.order}|".encode())
    h.update(m.file.read_bytes())
    return h.hexdigest()


def plan_pages(m: Material) -> tuple[list[PagePlan], str]:
    """Render and extract every page; decide which pages need vision or OCR. No API calls."""
    pdf_path = pdf_extract.to_pdf(m.file)
    pdf_pages = pdf_extract.read_pdf(pdf_path)
    is_pptx = m.file.suffix.lower() == ".pptx"
    pptx_slides = pptx_extract.extract(m.file) if is_pptx else None
    if pptx_slides is not None and len(pptx_slides) != len(pdf_pages):
        print(f"    ! {m.file.name}: {len(pptx_slides)} visible slides but {len(pdf_pages)} PDF pages; using PDF text only")
        pptx_slides = None

    pdf_template = pdf_extract.repeated_images(pdf_pages)
    pptx_template = pptx_extract.repeated_images(pptx_slides) if pptx_slides else set()
    bodies = [s.body for s in pptx_slides] if pptx_slides else [p.text for p in pdf_pages]
    # If most pages have a broken text layer, the file's encoding is broken: trust no page of it.
    untrusted_file = sum(looks_garbled(b) for b in bodies) > len(bodies) / 2
    plans: list[PagePlan] = []
    for i, page in enumerate(pdf_pages):
        if pptx_slides:
            s = pptx_slides[i]
            title, body, notes = s.title or page.title, s.body, s.notes
            reason = pptx_extract.visual_reason(s, pptx_template)
        else:
            title, body, notes = page.title, page.text, None
            reason = pdf_extract.visual_reason(page, pdf_template)
        mode = "describe"
        if looks_garbled(body) or (untrusted_file and body.strip()):
            mode, reason = "transcribe", "garbled text layer"
        elif len(body) < MIN_TEXT_CHARS and m.kind not in ("slides",) and not pptx_slides:
            # A near-empty PDF page in notes/readings is usually a scan. Slides are often just a title.
            mode, reason = "transcribe", "no text layer"
        elif len(body) < MIN_TEXT_CHARS:
            reason = reason or "little text"
        plans.append(PagePlan(page.number, title, body, notes, page.png, reason, mode, pdf_path))
    return plans, unit(m.kind, is_pptx)


def enrich(plans: list[PagePlan], where_prefix: str, stats: Stats, workers: int, use_vision: bool) -> dict[int, tuple[str | None, str | None]]:
    """Returns {page number: (visual_description, transcription)}.

    transcribe → local OCR (Tesseract): verbatim, free, offline. Not Claude: a word-for-word copy of
                 a published reading is exactly what the model declines to produce.
    describe   → Claude vision: diagrams, charts, images, equations.
    """
    out: dict[int, tuple[str | None, str | None]] = {}
    ocr_todo = [p for p in plans if p.mode == "transcribe"]
    # Sequential: MuPDF's OCR (Leptonica) refuses to run on two threads at once.
    for p in ocr_todo:
        stats.transcribed += 1
        out[p.number] = (None, pdf_extract.ocr_page(p.pdf, p.number))
    if not use_vision:
        return out

    describe_todo = [p for p in plans if p.mode == "describe" and p.reason]

    def one(p: PagePlan):
        return p, vision.describe(p.png, f"{where_prefix}, page {p.number}", p.body)

    with ThreadPoolExecutor(workers) as pool:
        for p, r in pool.map(one, describe_todo):
            stats.vision_calls += 1
            stats.vision_cached += r.cached
            stats.input_tokens += r.input_tokens
            stats.output_tokens += r.output_tokens
            if r.refused:
                stats.refusals += 1
                print(f"    ! page {p.number}: vision declined ({r.note}); kept its extracted text")
            out[p.number] = (r.text, None)
    return out


def ingest_course(store: Store, course: Course, args, stats: Stats) -> None:
    print(f"\n{course.code} — {course.title}  ({len(course.topics)} topics, {len(course.materials)} materials, {len(course.skipped)} skipped)")
    dry = args.dry_run
    course_id = store.course_id(course.code) if dry else store.upsert_course(course)
    topic_ids = {} if dry else store.sync_topics(course_id, course.topics)
    existing = store.existing_materials(course_id)

    # Removals first, so a new material can take over a freed material_order.
    wanted = {m.cmid for m in course.materials}
    for cmid, row in existing.items():
        if cmid not in wanted:
            print(f"  - remove   {row['source_file']}")
            stats.materials["removed"] += 1
            if not dry:
                store.delete_material(str(row["id"]))
                store.delete_images(store.list_images(f"{course.code}/{row['material_order']:02d}/"))

    for m in course.materials:
        title = m.title_override or title_from_filename(m.file.stem)
        topic_label = m.topic or "(course-level)"
        chash = content_hash(m)
        ex = existing.get(m.cmid)
        label = f"{m.order:02d} {m.kind:9} {title[:48]:48} → {topic_label}"
        if m.review:
            label += "   [review]"

        if ex and ex["content_hash"] == chash and not args.force:
            if dry:
                print(f"  = same     {label}")
                stats.materials["unchanged"] += 1
                continue
            topic_id = topic_ids.get(m.topic) if m.topic else None
            rows = store.slides_for(str(ex["id"]))
            rechunked = []
            for r in rows:
                chunk = build_chunk(
                    course_code=course.code, course_title=course.title, topic=m.topic, kind=m.kind,
                    material_title=title, unit_name=unit(m.kind, m.file.suffix.lower() == ".pptx"),
                    number=r["slide_number"], total=len(rows), title=r["title"], body=r["body_text"],
                    visual=r["visual_description"], notes=r["speaker_notes"],
                )
                if chunk != r["chunk_text"]:
                    rechunked.append((str(r["id"]), chunk))
            meta_changed = (
                str(ex["topic_id"]) if ex["topic_id"] else None) != topic_id or ex["kind"] != m.kind or ex["title"] != title \
                or ex["source_file"] != m.rel_file or ex["lms_section"] != m.section
            if rechunked or meta_changed:
                vectors = embed.embed_documents([c for _, c in rechunked]) if rechunked else []
                store.update_material_meta(str(ex["id"]), topic_id, m, title,
                                           [(sid, c, v) for (sid, c), v in zip(rechunked, vectors)])
                print(f"  ~ metadata {label}  ({len(rechunked)} chunks re-embedded)")
                stats.materials["metadata"] += 1
            else:
                print(f"  = same     {label}")
                stats.materials["unchanged"] += 1
            continue

        t0 = time.time()
        plans, unit_name = plan_pages(m)
        stats.pages += len(plans)
        stats.image_bytes += sum(len(p.png) for p in plans)
        n_vision = sum(1 for p in plans if p.reason and p.mode == "describe")
        n_transcribe = sum(1 for p in plans if p.mode == "transcribe")
        status = "changed" if ex else "new"
        stats.materials[status] += 1
        summary = f"{len(plans)} {unit_name}s, vision {n_vision}" + (f", OCR {n_transcribe}" if n_transcribe else "")
        if dry:
            print(f"  + {status:8} {label}  [{summary}]")
            stats.vision_calls += n_vision
            stats.transcribed += n_transcribe
            continue

        where = f"{unit_name}s from \"{title}\" ({m.kind}), course {course.code} {course.title}"
        results = enrich(plans, where, stats, args.workers, use_vision=not args.no_vision)
        slides: list[SlideRow] = []
        for p in plans:
            visual, transcript = results.get(p.number, (None, None))
            visual, transcript = sanitize(visual), sanitize(transcript)
            p.title, p.notes = sanitize(p.title), sanitize(p.notes)
            body = sanitize(transcript if transcript else p.body) or ""
            chunk = build_chunk(
                course_code=course.code, course_title=course.title, topic=m.topic, kind=m.kind,
                material_title=title, unit_name=unit_name, number=p.number, total=len(plans),
                title=p.title, body=body, visual=visual, notes=p.notes,
            )
            slides.append(SlideRow(
                number=p.number, slide_key=slide_key(course.code, m.order, p.number), title=p.title,
                body_text=body or None, visual_description=visual, speaker_notes=p.notes, chunk_text=chunk,
                embedding=None, image_path=image_path(course.code, m.order, p.number), png=p.png,
            ))
        for s, v in zip(slides, embed.embed_documents([s.chunk_text for s in slides])):
            s.embedding = v
        store.upload_images(slides)
        topic_id = topic_ids.get(m.topic) if m.topic else None
        store.replace_material(course_id, topic_id, m, title, chash, slides)
        # Clean up images the new version no longer has (fewer pages, or a changed material order).
        keep = {s.image_path for s in slides}
        stale = [p for p in store.list_images(f"{course.code}/{m.order:02d}/") if p not in keep]
        if ex and ex["material_order"] != m.order:
            stale += store.list_images(f"{course.code}/{ex['material_order']:02d}/")
        if stale:
            store.delete_images(stale)
        print(f"  + {status:8} {label}  [{summary}]  {time.time() - t0:.0f}s")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course", action="append", help="course code (repeatable); default: all")
    ap.add_argument("--dry-run", action="store_true", help="validate and plan; no API calls, no writes")
    ap.add_argument("--force", action="store_true", help="re-process materials even if unchanged (vision stays cached)")
    ap.add_argument("--no-vision", action="store_true", help="skip vision calls (text only)")
    ap.add_argument("--remove-course", metavar="CODE", help="delete a course with all its rows and images")
    ap.add_argument("--workers", type=int, default=8, help="parallel vision calls")
    args = ap.parse_args()

    try:
        courses = load(DATA)
    except ManifestError as e:
        print(f"Manifest problems (nothing was changed):\n{e}", file=sys.stderr)
        return 1

    store = Store()
    try:
        if args.remove_course:
            code = args.remove_course.upper()
            images = store.list_course_images(code)
            existed = store.delete_course(code)
            store.delete_images(images)
            print(f"{code}: {'deleted' if existed else 'was not in the database'}; {len(images)} images removed")
            return 0

        selected = courses
        if args.course:
            codes = {c.upper() for c in args.course}
            unknown = codes - {c.code for c in courses}
            if unknown:
                print(f"Not in manifest: {', '.join(sorted(unknown))}", file=sys.stderr)
                return 1
            selected = [c for c in courses if c.code in codes]

        reviews = [(c.code, m) for c in selected for m in c.materials if m.review]
        if reviews:
            print(f"{len(reviews)} manifest rows are marked review (ingested as written — check them):")
            for code, m in reviews:
                print(f"  {code} {m.order:02d} {m.file.name}: {m.review}")

        stats = Stats()
        t0 = time.time()
        for course in selected:
            ingest_course(store, course, args, stats)

        print("\n" + ("Plan (dry run — nothing written)" if args.dry_run else "Done") + f" in {time.time() - t0:.0f}s")
        print("  materials: " + ", ".join(f"{k} {v}" for k, v in stats.materials.items()))
        if stats.pages:
            print(f"  pages processed: {stats.pages}  (images {stats.image_bytes / 1e6:.1f} MB, avg {stats.image_bytes / stats.pages / 1024:.0f} KB)")
        print(f"  OCR: {stats.transcribed} pages   vision: {stats.vision_calls} calls"
              + ("" if args.dry_run else f", {stats.vision_cached} from cache, {stats.refusals} refused"))
        if not args.dry_run:
            usd = stats.input_tokens / 1e6 * VISION_USD_PER_MTOK[0] + stats.output_tokens / 1e6 * VISION_USD_PER_MTOK[1]
            print(f"  {VISION_MODEL}: {stats.input_tokens} in / {stats.output_tokens} out tokens ≈ ${usd:.3f}")
            print(f"  voyage-4: {embed.tokens_used} tokens")
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    sys.exit(main())
