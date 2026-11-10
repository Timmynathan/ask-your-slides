"""Ingestion CLI: data/<institution>/catalog.yaml → Supabase (PRD §9).

  uv run ingest.py --course CSC420 --dry-run   # validate + plan, no API calls, no writes
  uv run ingest.py --course CSC420             # ingest one course (every programme with that code)
  uv run ingest.py --course computer-science/INS401   # one programme's INS401
  uv run ingest.py                             # every course in the catalog
  uv run ingest.py --remove-course computer-science/CSC420   # delete a course, its rows and images

Each course loads its course.yaml, the manifest of its current session and past_papers.yaml
(validated and listed; not ingested yet).

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

import code_extract
import docx_extract
import embed
import filetype
import notebook_extract
import pdf_extract
import pptx_extract
import vision
from chunks import build_chunk, image_path, looks_garbled, sanitize, slide_key, unit
from config import DATA, PIPELINE_VERSION, VISION_MODEL, VISION_USD_PER_MTOK
from manifest import Course, ManifestError, Material, load, programmes, title_from_filename
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
    is_pptx = m.file_type == "pptx"
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


@dataclass
class TextUnit:
    """A chunk of a Word, notebook or code file: no vision; cited by its label."""
    number: int
    title: str | None
    label: str
    body: str
    path: str | None  # full heading path (Word), for the chunk text
    view: dict | None  # what the viewer shows when there is no page image
    page: int | None  # Word: the rendered PDF page the section starts on
    png: bytes | None = None


def plan_text_units(m: Material) -> tuple[list[TextUnit], str]:
    """Word → sections (+ the rendered page each starts on); notebook → cell groups; code → parts."""
    if m.file_type == "docx":
        secs = docx_extract.sections(m.file)
        pages = pdf_extract.read_pdf(pdf_extract.to_pdf(m.file))  # LibreOffice render, for the viewer
        starts = docx_extract.page_of_sections(secs, [p.text for p in pages])
        units, seen = [], set()
        for s, page in zip(secs, starts):
            png = pages[page - 1].png if page not in seen else None
            seen.add(page)
            units.append(TextUnit(s.number, s.title, s.label, s.body, s.path, None, page, png))
        return units, unit(m.kind, False, "docx")
    if m.file_type == "ipynb":
        return [TextUnit(c.number, c.title, c.label, c.body, None, c.view, None) for c in notebook_extract.chunks(m.file)], \
            unit(m.kind, False, "ipynb")
    lang = filetype.language(m.file)
    return [TextUnit(c.number, c.title, c.label, c.body, None, c.view, None)
            for c in code_extract.chunks(m.file, lang)], unit(m.kind, False, "code")


TEXT_TYPES = {"docx", "ipynb", "code"}


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


def relocate_legacy_images(store: Store, course_id: str) -> int:
    """Images stored before the catalog live under the course code (CSC420/02/1.png), which repeats
    across programmes. Move them under the course id once; a no-op afterwards."""
    rows = store.legacy_images(course_id)
    moves = [(str(r["id"]), r["image_path"], f"{course_id}/{r['image_path'].split('/', 1)[1]}") for r in rows]
    if moves:
        store.move_images(moves)
    return len(moves)


def ingest_course(store: Store, course: Course, args, stats: Stats) -> None:
    print(f"\n{course.key} — {course.title}, {course.session}  ({len(course.topics)} topics, {len(course.materials)} materials, "
          f"{len(course.skipped)} skipped, {len(course.past_papers)} past papers)")
    dry = args.dry_run
    if dry:
        course_id, session_id = store.course_id(course), None
    else:
        course_id, session_id = store.upsert_course(course)
        moved = relocate_legacy_images(store, course_id)
        if moved:
            print(f"  moved {moved} slide images under the course id")
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
                store.delete_images(store.list_images(f"{course_id}/{row['material_order']:02d}/"))

    for m in course.materials:
        title = m.title_override or title_from_filename(m.file.stem)
        if m.file_type == "code" and not m.title_override:
            title += m.file.suffix  # "PlayerMovement.cs": chips read "PlayerMovement.cs · lines 12–48"
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
                    material_title=title, unit_name=unit(m.kind, m.file_type == "pptx", m.file_type),
                    number=r["slide_number"], total=len(rows), title=r["title"], body=r["body_text"],
                    visual=r["visual_description"], notes=r["speaker_notes"], label=r["label"],
                    student_work=m.source == "student",
                )
                if chunk != r["chunk_text"]:
                    rechunked.append((str(r["id"]), chunk))
            meta_changed = (
                str(ex["topic_id"]) if ex["topic_id"] else None) != topic_id or ex["kind"] != m.kind or ex["title"] != title \
                or ex["source_file"] != m.rel_file or ex["lms_section"] != m.section \
                or str(ex["course_session_id"]) != session_id or ex["source"] != m.source
            if rechunked or meta_changed:
                vectors = embed.embed_documents([c for _, c in rechunked]) if rechunked else []
                store.update_material_meta(str(ex["id"]), session_id, topic_id, m, title,
                                           [(sid, c, v) for (sid, c), v in zip(rechunked, vectors)])
                print(f"  ~ metadata {label}  ({len(rechunked)} chunks re-embedded)")
                stats.materials["metadata"] += 1
            else:
                print(f"  = same     {label}")
                stats.materials["unchanged"] += 1
            continue

        t0 = time.time()
        if m.file_type != m.file.suffix.lower().lstrip(".") and filetype.expected_from_extension(m.file) not in (m.file_type, None):
            print(f"    ! {m.file.name} is really a {filetype.SUPPORTED[m.file_type]} file; read as one")
        if m.file_type in TEXT_TYPES:
            ingest_text_material(store, course, m, title, label, ex, chash, course_id, session_id, topic_ids, args, stats)
            continue
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
                title=p.title, body=body, visual=visual, notes=p.notes, student_work=m.source == "student",
            )
            slides.append(SlideRow(
                number=p.number, slide_key=slide_key(course.code, m.order, p.number), title=p.title,
                body_text=body or None, visual_description=visual, speaker_notes=p.notes, chunk_text=chunk,
                embedding=None, image_path=image_path(course_id, m.order, p.number), png=p.png,
            ))
        for s, v in zip(slides, embed.embed_documents([s.chunk_text for s in slides])):
            s.embedding = v
        store.upload_images(slides)
        topic_id = topic_ids.get(m.topic) if m.topic else None
        if ex and str(ex["course_session_id"]) != session_id:
            store.delete_material(str(ex["id"]))  # same LMS id carried into a new session: replace, don't collide
        store.replace_material(course_id, session_id, topic_id, m, title, chash, slides)
        # Clean up images the new version no longer has (fewer pages, or a changed material order).
        keep = {s.image_path for s in slides}
        stale = [p for p in store.list_images(f"{course_id}/{m.order:02d}/") if p not in keep]
        if ex and ex["material_order"] != m.order:
            stale += store.list_images(f"{course_id}/{ex['material_order']:02d}/")
        if stale:
            store.delete_images(stale)
        print(f"  + {status:8} {label}  [{summary}]  {time.time() - t0:.0f}s")


def ingest_text_material(store: Store, course: Course, m: Material, title: str, label: str, ex: dict | None, chash: str,
                         course_id: str | None, session_id: str | None, topic_ids: dict, args, stats: Stats) -> None:
    """Word / notebook / code: chunk, embed, store. Word pages are rendered for the viewer; no vision."""
    t0 = time.time()
    units, unit_name = plan_text_units(m)
    status = "changed" if ex else "new"
    stats.materials[status] += 1
    summary = f"{len(units)} {unit_name}s"
    if args.dry_run:
        print(f"  + {status:8} {label}  [{summary}]")
        return
    rows: list[SlideRow] = []
    for u in units:
        body = sanitize(u.body) or ""
        chunk = build_chunk(
            course_code=course.code, course_title=course.title, topic=m.topic, kind=m.kind, material_title=title,
            unit_name=unit_name, number=u.number, total=len(units), title=sanitize(u.title), body=body, visual=None, notes=None,
            label=u.path or u.label, student_work=m.source == "student",
        )
        rows.append(SlideRow(
            number=u.number, slide_key=slide_key(course.code, m.order, u.number), title=sanitize(u.title), body_text=body or None,
            visual_description=None, speaker_notes=None, chunk_text=chunk, embedding=None,
            image_path=image_path(course_id, m.order, u.page) if u.page else None, png=u.png, label=u.label, view=u.view,
        ))
    for r, v in zip(rows, embed.embed_documents([r.chunk_text for r in rows])):
        r.embedding = v
    store.upload_images(rows)
    topic_id = topic_ids.get(m.topic) if m.topic else None
    if ex and str(ex["course_session_id"]) != session_id:
        store.delete_material(str(ex["id"]))
    store.replace_material(course_id, session_id, topic_id, m, title, chash, rows)
    keep = {r.image_path for r in rows if r.image_path}
    stale = [p for p in store.list_images(f"{course_id}/{m.order:02d}/") if p not in keep]
    if ex and ex["material_order"] != m.order:
        stale += store.list_images(f"{course_id}/{ex['material_order']:02d}/")
    if stale:
        store.delete_images(stale)
    stats.pages += len(units)
    print(f"  + {status:8} {label}  [{summary}]  {time.time() - t0:.0f}s")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--course", action="append", help="CODE, programme/CODE or institution/programme/CODE (repeatable); default: all")
    ap.add_argument("--dry-run", action="store_true", help="validate and plan; no API calls, no writes")
    ap.add_argument("--force", action="store_true", help="re-process materials even if unchanged (vision stays cached)")
    ap.add_argument("--no-vision", action="store_true", help="skip vision calls (text only)")
    ap.add_argument("--remove-course", metavar="COURSE", help="delete a course (programme/CODE if the code is in several programmes) with all its rows and images")
    ap.add_argument("--workers", type=int, default=8, help="parallel vision calls")
    args = ap.parse_args()

    try:
        courses = load(DATA)
    except ManifestError as e:
        print(f"Data problems (nothing was changed):\n{e}", file=sys.stderr)
        return 1

    store = Store()
    try:
        if args.remove_course:
            rows = store.find_courses(args.remove_course)
            if len(rows) > 1:
                names = ", ".join(f"{r['programme']}/{r['code']}" for r in rows)
                print(f"{args.remove_course} is in several programmes ({names}); name one, e.g. {rows[0]['programme']}/{rows[0]['code']}",
                      file=sys.stderr)
                return 1
            if not rows:
                print(f"{args.remove_course}: was not in the database")
                return 0
            cid = str(rows[0]["id"])
            images = sorted(set(store.list_course_images(cid)) | set(store.slide_image_paths(cid)))
            store.delete_course(cid)
            store.delete_images(images)
            print(f"{rows[0]['institution']}/{rows[0]['programme']}/{rows[0]['code']}: deleted; {len(images)} images removed")
            return 0

        selected = courses
        if args.course:
            unknown = [s for s in args.course if not any(c.matches(s) for c in courses)]
            if unknown:
                print(f"Not in the catalog: {', '.join(unknown)}", file=sys.stderr)
                return 1
            selected = [c for c in courses if any(c.matches(s) for s in args.course)]

        reviews = [(c.key, m) for c in selected for m in c.materials if m.review]
        if reviews:
            print(f"{len(reviews)} manifest rows are marked review (ingested as written — check them):")
            for code, m in reviews:
                print(f"  {code} {m.order:02d} {m.file.name}: {m.review}")

        if not args.dry_run:
            store.upsert_programmes(programmes(DATA))
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
