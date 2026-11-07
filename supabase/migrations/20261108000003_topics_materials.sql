-- Topics and materials (data/manifest.yaml is the source of truth for structure).
--
--   course → topics → materials → slides
--
-- decks becomes materials with a kind. A material may have no topic (topic_id null): course-level
-- files such as outlines, which feed whole-course overviews and are never a topic chat.
-- The slides table keeps its name: one row = one slide or page of any material.
-- Manifest rows with kind: skipped are never ingested, so 'skipped' is not a valid kind here.

-- ── topics ──────────────────────────────────────────────────
create table public.topics (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  topic_order  int  not null,
  title        text not null,
  unique (course_id, topic_order),
  unique (course_id, title),
  unique (id, course_id)              -- target for the "topic belongs to this course" FKs below
);

alter table public.topics enable row level security;
create policy "signed-in users read topics" on public.topics for select to authenticated using (true);
revoke all on public.topics from anon;
revoke insert, update, delete on public.topics from authenticated;

-- ── decks → materials ───────────────────────────────────────
alter table public.decks rename to materials;
alter table public.materials rename column deck_order to material_order;   -- = manifest lms_order
alter table public.materials rename column slide_count to page_count;
alter index public.decks_course_idx rename to materials_course_idx;
alter table public.materials rename constraint decks_course_id_source_file_key to materials_course_id_source_file_key;
alter table public.materials rename constraint decks_pkey to materials_pkey;
alter table public.materials rename constraint decks_course_id_fkey to materials_course_id_fkey;
alter policy "signed-in users read decks" on public.materials rename to "signed-in users read materials";

alter table public.materials
  add column topic_id     uuid,
  add column kind         text not null check (kind in ('slides', 'notes', 'reading', 'practical', 'outline', 'other')),
  add column lms_cmid     int,
  add column lms_section  text,
  add constraint materials_topic_fk foreign key (topic_id, course_id)
    references public.topics (id, course_id) on delete set null (topic_id),
  add constraint materials_course_order_key unique (course_id, material_order),
  add constraint materials_lms_cmid_key unique (lms_cmid);
create index materials_topic_idx on public.materials (topic_id);

alter table public.slides rename column deck_id to material_id;
alter table public.slides rename constraint slides_deck_id_fkey to slides_material_id_fkey;
alter table public.slides rename constraint slides_deck_id_slide_number_key to slides_material_id_slide_number_key;

-- ── conversations: optional topic (null = whole-course chat) ─
alter table public.conversations
  add column topic_id uuid,
  add constraint conversations_topic_fk foreign key (topic_id, course_id)
    references public.topics (id, course_id) on delete set null (topic_id);

-- ── match_slides v2 ─────────────────────────────────────────
drop function public.match_slides(uuid, extensions.vector, text, int);

-- Hybrid search (vector + full-text, RRF k = 60) within one course, optionally one topic.
--   p_topic_id  null = whole course.
--   p_kinds     material kinds to search. Default leaves out outline and other: outlines feed
--               overviews (read in full, not searched); "other" is used only when asked directly.
-- Readings are supporting sources: their fused score is weighted 0.85 so slides and notes win ties.
-- similarity = cosine similarity of the vector match (null when matched by keyword only). The
-- search tool uses it to decide whether a topic search was good enough or must widen to the course.
create function public.match_slides(
  p_course_id        uuid,
  p_query_embedding  extensions.vector(1024),
  p_query_text       text,
  p_k                int    default 8,
  p_topic_id         uuid   default null,
  p_kinds            text[] default array['slides', 'notes', 'practical', 'reading']
)
returns table (
  slide_id        uuid,
  slide_key       text,
  material_id     uuid,
  material_title  text,
  material_kind   text,
  material_order  int,
  topic_id        uuid,
  topic_title     text,
  slide_number    int,
  page_count      int,
  title           text,
  chunk_text      text,
  prev_title      text,
  next_title      text,
  similarity      double precision,
  score           double precision
)
language sql stable security invoker set search_path = public, extensions
as $$
  with
  q as (
    select nullif(replace(plainto_tsquery('english', coalesce(p_query_text, ''))::text, ' & ', ' | '), '')::tsquery as tsq
  ),
  candidates as (
    select s.id, s.embedding, s.fts, m.kind
    from slides s
    join materials m on m.id = s.material_id
    where s.course_id = p_course_id
      and (p_topic_id is null or m.topic_id = p_topic_id)
      and m.kind = any (p_kinds)
  ),
  semantic as (
    select c.id, c.embedding <=> p_query_embedding as distance,
           row_number() over (order by c.embedding <=> p_query_embedding, c.id) as rank
    from candidates c
    where c.embedding is not null and p_query_embedding is not null
    order by c.embedding <=> p_query_embedding, c.id
    limit 20
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q.tsq) desc, c.id) as rank
    from candidates c, q
    where c.fts @@ q.tsq
    order by ts_rank_cd(c.fts, q.tsq) desc, c.id
    limit 20
  ),
  fused as (
    select coalesce(se.id, kw.id) as id,
           1 - se.distance as similarity,
           (coalesce(1.0 / (60 + se.rank), 0.0) + coalesce(1.0 / (60 + kw.rank), 0.0))
             * case when c.kind = 'reading' then 0.85 else 1.0 end as score
    from semantic se
    full outer join keyword kw on kw.id = se.id
    join candidates c on c.id = coalesce(se.id, kw.id)
    order by score desc, id
    limit least(greatest(coalesce(p_k, 8), 1), 20)
  )
  select s.id, s.slide_key, m.id, m.title, m.kind, m.material_order, t.id, t.title,
         s.slide_number, m.page_count, s.title, s.chunk_text, prev.title, nxt.title,
         f.similarity::double precision, f.score::double precision
  from fused f
  join slides s     on s.id = f.id
  join materials m  on m.id = s.material_id
  left join topics t on t.id = m.topic_id
  left join slides prev on prev.material_id = s.material_id and prev.slide_number = s.slide_number - 1
  left join slides nxt  on nxt.material_id  = s.material_id and nxt.slide_number  = s.slide_number + 1
  order by f.score desc, s.id;
$$;

grant execute on function public.match_slides(uuid, extensions.vector, text, int, uuid, text[]) to authenticated, service_role;
revoke execute on function public.match_slides(uuid, extensions.vector, text, int, uuid, text[]) from anon, public;
