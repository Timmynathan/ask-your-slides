"""Supabase writes: Postgres rows over DATABASE_URL, slide images over the Storage REST API."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx
import psycopg
from psycopg.rows import dict_row

from config import BUCKET, env
from manifest import Course, Material, Topic


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
    image_path: str
    png: bytes | None = None


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
    def course_id(self, code: str) -> str | None:
        row = self.db.execute("select id from courses where code = %s", (code,)).fetchone()
        return str(row["id"]) if row else None

    def existing_materials(self, course_id: str | None) -> dict[int, dict]:
        if course_id is None:
            return {}
        rows = self.db.execute(
            "select id, lms_cmid, material_order, content_hash, title, kind, topic_id, lms_section, source_file, page_count "
            "from materials where course_id = %s",
            (course_id,),
        ).fetchall()
        return {r["lms_cmid"]: r for r in rows}

    def slides_for(self, material_id: str) -> list[dict]:
        return self.db.execute(
            "select id, slide_number, title, body_text, visual_description, speaker_notes, chunk_text "
            "from slides where material_id = %s order by slide_number",
            (material_id,),
        ).fetchall()

    # ── writes (each method commits its own transaction) ────
    def upsert_course(self, c: Course) -> str:
        with self.db.transaction():
            row = self.db.execute(
                "insert into courses (code, title, department, lecturer, sort_order) values (%s, %s, %s, %s, %s) "
                "on conflict (code) do update set title = excluded.title, department = excluded.department, "
                "lecturer = excluded.lecturer, sort_order = excluded.sort_order returning id",
                (c.code, c.title, c.department, c.lecturer, c.sort_order),
            ).fetchone()
        return str(row["id"])

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
        self, course_id: str, topic_id: str | None, m: Material, title: str, content_hash: str, slides: list[SlideRow]
    ) -> str:
        with self.db.transaction():
            row = self.db.execute(
                "insert into materials (course_id, topic_id, kind, material_order, title, source_file, content_hash, "
                "page_count, lms_cmid, lms_section, ingested_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now()) "
                "on conflict (lms_cmid) do update set course_id = excluded.course_id, topic_id = excluded.topic_id, "
                "kind = excluded.kind, material_order = excluded.material_order, title = excluded.title, "
                "source_file = excluded.source_file, content_hash = excluded.content_hash, "
                "page_count = excluded.page_count, lms_section = excluded.lms_section, ingested_at = now() returning id",
                (course_id, topic_id, m.kind, m.order, title, m.rel_file, content_hash, len(slides), m.cmid, m.section),
            ).fetchone()
            material_id = str(row["id"])
            self.db.execute("delete from slides where material_id = %s", (material_id,))
            with self.db.cursor() as cur:
                cur.executemany(
                    "insert into slides (material_id, course_id, slide_number, slide_key, title, body_text, "
                    "visual_description, speaker_notes, chunk_text, embedding, image_path) "
                    "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::extensions.vector,%s)",
                    [
                        (material_id, course_id, s.number, s.slide_key, s.title, s.body_text, s.visual_description,
                         s.speaker_notes, s.chunk_text, vector_literal(s.embedding), s.image_path)
                        for s in slides
                    ],
                )
        return material_id

    def update_material_meta(
        self, material_id: str, topic_id: str | None, m: Material, title: str, rechunked: list[tuple[str, str, list[float]]]
    ) -> None:
        """Topic/kind/title changed but the file did not: no re-render, no vision; re-embed changed chunks."""
        with self.db.transaction():
            self.db.execute(
                "update materials set topic_id = %s, kind = %s, title = %s, source_file = %s, lms_section = %s where id = %s",
                (topic_id, m.kind, title, m.rel_file, m.section, material_id),
            )
            with self.db.cursor() as cur:
                cur.executemany(
                    "update slides set chunk_text = %s, embedding = %s::extensions.vector where id = %s",
                    [(chunk, vector_literal(vec), sid) for sid, chunk, vec in rechunked],
                )

    def delete_material(self, material_id: str) -> None:
        with self.db.transaction():
            self.db.execute("delete from materials where id = %s", (material_id,))

    def delete_course(self, code: str) -> bool:
        with self.db.transaction():
            row = self.db.execute("delete from courses where code = %s returning id", (code,)).fetchone()
        return row is not None

    # ── storage ─────────────────────────────────────────────
    def upload_images(self, slides: list[SlideRow], workers: int = 8) -> None:
        def put(s: SlideRow) -> None:
            r = self.http.post(
                f"/object/{BUCKET}/{s.image_path}",
                content=s.png,
                headers={"Content-Type": "image/png", "x-upsert": "true", "cache-control": "3600"},
            )
            if r.status_code >= 300:
                raise RuntimeError(f"upload {s.image_path} failed: {r.status_code} {r.text[:200]}")

        with ThreadPoolExecutor(workers) as pool:
            list(pool.map(put, slides))

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

    def list_course_images(self, code: str) -> list[str]:
        r = self.http.post(f"/object/list/{BUCKET}", json={"prefix": f"{code}/", "limit": 1000})
        r.raise_for_status()
        folders = [o["name"] for o in r.json() if not o.get("id")]
        return [p for f in folders for p in self.list_images(f"{code}/{f}/")]

    def signed_url(self, path: str, seconds: int = 3600) -> str:
        r = self.http.post(f"/object/sign/{BUCKET}/{path}", json={"expiresIn": seconds})
        r.raise_for_status()
        signed = r.json()["signedURL"]  # "/object/sign/..." relative to /storage/v1
        base = str(self.http.base_url).rstrip("/")
        return base + (signed if not signed.startswith("/storage/v1") else signed[len("/storage/v1"):])
