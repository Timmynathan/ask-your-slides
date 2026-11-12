"""Supabase writes: Postgres rows over DATABASE_URL, slide images over the Storage REST API."""

from __future__ import annotations

import io
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx
import psycopg
from config import BUCKET, env
from manifest import Course, Material, Topic
from PIL import Image
from psycopg.rows import dict_row


@dataclass
class SlideRow:
    number: int
    slide_key: str
    title: str | None
    body_text: str | None
    visual_description: str | None
    speaker_notes: str | None
    chunk_text: str
    embedding: list[float] | None
    image_path: str | None
    png: bytes | None = None
    label: str | None = None  # Word section path, "Cells 4–6", "lines 12–48"; None for pages/slides
    view: dict | None = None  # notebook cells / code lines for the viewer (no page image)


def to_webp(png: bytes, quality: int = 80) -> bytes:
    buf = io.BytesIO()
    Image.open(io.BytesIO(png)).convert("RGB").save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def vector_literal(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.7g}" for x in v) + "]"


class Store:
    def __init__(self) -> None:
        # autocommit=True so each `with self.db.transaction()` is a real, committed transaction.
        # (With autocommit off, any earlier SELECT opens an implicit transaction, every later
        # transaction() block silently becomes a savepoint inside it, and nothing is committed.)
        self.db = psycopg.connect(env("DATABASE_URL"), row_factory=dict_row, autocommit=True)
        key = env("SUPABASE_SECRET_KEY")
        self.http = httpx.Client(
            base_url=f"{env('NEXT_PUBLIC_SUPABASE_URL').rstrip('/')}/storage/v1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=120,
        )

    def close(self) -> None:
        self.db.close()
        self.http.close()

    # ── reads ───────────────────────────────────────────────
    def course_id(self, c: Course) -> str | None:
        row = self.db.execute(
            "select id from courses where institution = %s and programme = %s and code = %s",
            (c.institution, c.programme, c.code),
        ).fetchone()
        return str(row["id"]) if row else None

    def find_courses(self, selector: str) -> list[dict]:
        """CODE, programme/CODE or institution/programme/CODE → matching course rows."""
        parts = selector.strip().strip("/").split("/")
        cols = ["code", "programme", "institution"][: len(parts)]
        vals = [parts[-1].upper(), *reversed(parts[:-1])]
        where = " and ".join(f"{c} = %s" for c in cols)
        return self.db.execute(
            f"select id, institution, programme, code from courses where {where} order by sort_order", vals
        ).fetchall()

    def legacy_images(self, course_id: str) -> list[dict]:
        """Slides whose image is not yet under <course_id>/ (stored by code before the catalog)."""
        return self.db.execute(
            "select id, image_path from slides where course_id = %s and image_path is not null "
            "and image_path not like %s",
            (course_id, f"{course_id}/%"),
        ).fetchall()

    def slide_image_paths(self, course_id: str) -> list[str]:
        rows = self.db.execute(
            "select image_path from slides where course_id = %s and image_path is not null", (course_id,)
        ).fetchall()
        return [r["image_path"] for r in rows]

    def existing_materials(self, course_id: str | None) -> dict[int, dict]:
        if course_id is None:
            return {}
        rows = self.db.execute(
            "select id, lms_cmid, material_order, content_hash, title, kind, topic_id, lms_section, source_file, page_count, "
            "course_session_id, source from materials where course_id = %s",
            (course_id,),
        ).fetchall()
        return {r["lms_cmid"]: r for r in rows}

    def slides_for(self, material_id: str) -> list[dict]:
        return self.db.execute(
            "select id, slide_number, title, body_text, visual_description, speaker_notes, chunk_text, label "
            "from slides where material_id = %s order by slide_number",
            (material_id,),
        ).fetchall()

    # ── writes (each method commits its own transaction) ────
    def upsert_course(self, c: Course) -> tuple[str, str]:
        """Returns (course id, course session id)."""
        with self.db.transaction():
            row = self.db.execute(
                "insert into courses (institution, school, programme, code, title, department, level, semester, session, "
                "aliases, lms_course_id, lecturer, sort_order, elective, code_confirmed) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "on conflict (institution, programme, code) do update set school = excluded.school, "
                "title = excluded.title, department = excluded.department, level = excluded.level, "
                "semester = excluded.semester, session = excluded.session, aliases = excluded.aliases, "
                "lms_course_id = excluded.lms_course_id, lecturer = excluded.lecturer, sort_order = excluded.sort_order, "
                "elective = excluded.elective, code_confirmed = excluded.code_confirmed "
                "returning id",
                (c.institution, c.school, c.programme, c.code, c.title, c.department, c.level, c.semester, c.session,
                 list(c.aliases), c.lms_course_id, c.lecturer, c.sort_order, c.elective, c.code_confirmed),
            ).fetchone()
            course_id = str(row["id"])
            srow = self.db.execute(
                "insert into course_sessions (course_id, session, lms_course_id) values (%s, %s, %s) "
                "on conflict (course_id, session) do update set lms_course_id = excluded.lms_course_id returning id",
                (course_id, c.session, c.lms_course_id),
            ).fetchone()
        return course_id, str(srow["id"])

    def course_counts(self, c: Course) -> tuple[int, int]:
        """(materials, chunks) stored for a course."""
        row = self.db.execute(
            "select (select count(*) from materials m where m.course_id = c.id) as materials, "
            "(select count(*) from slides s where s.course_id = c.id) as chunks "
            "from courses c where c.institution = %s and c.programme = %s and c.code = %s",
            (c.institution, c.programme, c.code),
        ).fetchone()
        return (row["materials"], row["chunks"]) if row else (0, 0)

    def upsert_programmes(self, programmes: list) -> None:
        """Programme names, departments and schools from catalog.yaml (onboarding lists them)."""
        with self.db.transaction():
            for p in programmes:
                self.db.execute(
                    "insert into programmes (institution, id, name, short_name, department, school, school_name, sort_order) "
                    "values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict (institution, id) do update set name = excluded.name, "
                    "short_name = excluded.short_name, department = excluded.department, school = excluded.school, "
                    "school_name = excluded.school_name, sort_order = excluded.sort_order",
                    (p.institution, p.id, p.name, p.short_name, p.department, p.school, p.school_name, p.sort_order),
                )

    def sync_topics(self, course_id: str, topics: tuple[Topic, ...]) -> dict[str, str]:
        """Upsert by title (keeps ids, so chats stay attached), re-number, delete topics no longer listed."""
        titles = [t.title for t in topics]
        with self.db.transaction():
            # Park existing orders out of the way so re-numbering can't collide with the unique key.
            self.db.execute("update topics set topic_order = topic_order + 100000 where course_id = %s", (course_id,))
            self.db.execute("delete from topics where course_id = %s and not (title = any(%s))", (course_id, titles))
            for t in topics:
                self.db.execute(
                    "insert into topics (course_id, topic_order, title) values (%s, %s, %s) "
                    "on conflict (course_id, title) do update set topic_order = excluded.topic_order",
                    (course_id, t.order, t.title),
                )
            rows = self.db.execute("select id, title from topics where course_id = %s", (course_id,)).fetchall()
        return {r["title"]: str(r["id"]) for r in rows}

    def replace_material(
        self, course_id: str, session_id: str, topic_id: str | None, m: Material, title: str, content_hash: str,
        slides: list[SlideRow],
    ) -> str:
        with self.db.transaction():
            row = self.db.execute(
                "insert into materials (course_id, course_session_id, topic_id, kind, material_order, title, source_file, "
                "content_hash, page_count, lms_cmid, lms_section, source, ingested_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now()) "
                "on conflict (course_session_id, lms_cmid) do update set topic_id = excluded.topic_id, "
                "kind = excluded.kind, material_order = excluded.material_order, title = excluded.title, "
                "source_file = excluded.source_file, content_hash = excluded.content_hash, "
                "page_count = excluded.page_count, lms_section = excluded.lms_section, source = excluded.source, "
                "ingested_at = now() returning id",
                (course_id, session_id, topic_id, m.kind, m.order, title, m.rel_file, content_hash, len(slides), m.cmid, m.section,
                 m.source),
            ).fetchone()
            material_id = str(row["id"])
            self.db.execute("delete from slides where material_id = %s", (material_id,))
            with self.db.cursor() as cur:
                cur.executemany(
                    "insert into slides (material_id, course_id, slide_number, slide_key, title, body_text, "
                    "visual_description, speaker_notes, chunk_text, embedding, image_path, label, view) "
                    "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::extensions.vector,%s,%s,%s)",
                    [
                        (material_id, course_id, s.number, s.slide_key, s.title, s.body_text, s.visual_description,
                         s.speaker_notes, s.chunk_text, vector_literal(s.embedding), s.image_path, s.label,
                         json.dumps(s.view) if s.view is not None else None)
                        for s in slides
                    ],
                )
        return material_id

    def update_material_meta(
        self, material_id: str, session_id: str, topic_id: str | None, m: Material, title: str,
        rechunked: list[tuple[str, str, list[float]]],
    ) -> None:
        """Topic/kind/title/path changed but the file did not: no re-render, no vision; re-embed changed chunks."""
        with self.db.transaction():
            self.db.execute(
                "update materials set course_session_id = %s, topic_id = %s, kind = %s, title = %s, source_file = %s, "
                "lms_section = %s, source = %s where id = %s",
                (session_id, topic_id, m.kind, title, m.rel_file, m.section, m.source, material_id),
            )
            with self.db.cursor() as cur:
                cur.executemany(
                    "update slides set chunk_text = %s, embedding = %s::extensions.vector where id = %s",
                    [(chunk, vector_literal(vec), sid) for sid, chunk, vec in rechunked],
                )

    def delete_material(self, material_id: str) -> None:
        with self.db.transaction():
            self.db.execute("delete from materials where id = %s", (material_id,))

    def delete_course(self, course_id: str) -> bool:
        with self.db.transaction():
            row = self.db.execute("delete from courses where id = %s returning id", (course_id,)).fetchone()
        return row is not None

    # ── storage ─────────────────────────────────────────────
    def upload_images(self, slides: list[SlideRow], workers: int = 8) -> None:
        """Pages are rendered as PNG (vision reads those) and stored as WebP: ~34% of the size, same
        look on screen (quality 80, measured on 60 PAU pages)."""
        def put(s: SlideRow) -> None:
            webp = s.image_path.endswith(".webp")
            r = self.http.post(
                f"/object/{BUCKET}/{s.image_path}",
                content=to_webp(s.png) if webp else s.png,
                headers={"Content-Type": "image/webp" if webp else "image/png", "x-upsert": "true", "cache-control": "3600"},
            )
            if r.status_code >= 300:
                raise RuntimeError(f"upload {s.image_path} failed: {r.status_code} {r.text[:200]}")

        with ThreadPoolExecutor(workers) as pool:
            list(pool.map(put, [s for s in slides if s.png is not None and s.image_path]))

    def list_images(self, prefix: str) -> list[str]:
        names: list[str] = []
        offset = 0
        while True:
            r = self.http.post(f"/object/list/{BUCKET}", json={"prefix": prefix, "limit": 1000, "offset": offset})
            r.raise_for_status()
            batch = [f"{prefix}{o['name']}" for o in r.json() if o.get("id")]  # id is null for folders
            names.extend(batch)
            if len(r.json()) < 1000:
                return names
            offset += 1000

    def delete_images(self, paths: list[str]) -> None:
        for i in range(0, len(paths), 500):
            r = self.http.request("DELETE", f"/object/{BUCKET}", json={"prefixes": paths[i : i + 500]})
            r.raise_for_status()

    def list_course_images(self, course_id: str) -> list[str]:
        r = self.http.post(f"/object/list/{BUCKET}", json={"prefix": f"{course_id}/", "limit": 1000})
        r.raise_for_status()
        folders = [o["name"] for o in r.json() if not o.get("id")]
        return [p for f in folders for p in self.list_images(f"{course_id}/{f}/")]

    def move_images(self, moves: list[tuple[str, str, str]], workers: int = 8) -> None:
        """moves: (slide id, from path, to path). Moves each object, then points its slide row at it.
        A source that is already gone but whose target exists (an earlier run stopped half way) counts as moved."""
        def mv(item: tuple[str, str, str]) -> None:
            _, src, dst = item
            r = self.http.post("/object/move", json={"bucketId": BUCKET, "sourceKey": src, "destinationKey": dst})
            if r.status_code >= 300:
                exists = self.http.head(f"/object/{BUCKET}/{dst}")
                if exists.status_code != 200:
                    raise RuntimeError(f"move {src} → {dst} failed: {r.status_code} {r.text[:200]}")

        with ThreadPoolExecutor(workers) as pool:
            list(pool.map(mv, moves))
        with self.db.transaction(), self.db.cursor() as cur:
            cur.executemany("update slides set image_path = %s where id = %s", [(dst, sid) for sid, _, dst in moves])

    def signed_url(self, path: str, seconds: int = 3600) -> str:
        r = self.http.post(f"/object/sign/{BUCKET}/{path}", json={"expiresIn": seconds})
        r.raise_for_status()
        signed = r.json()["signedURL"]  # "/object/sign/..." relative to /storage/v1
        base = str(self.http.base_url).rstrip("/")
        return base + (signed if not signed.startswith("/storage/v1") else signed[len("/storage/v1"):])
