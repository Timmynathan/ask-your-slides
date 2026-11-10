-- New material types and material trust (PRD F11).
--
-- slides.label   citation label for chunks that aren't a page or slide:
--                Word section "Law of Privacy › Exceptions", notebook "Cells 4–6", code "lines 12–48".
--                Null for PDF/PowerPoint pages (the chip shows "Slide 12" / "p. 12").
-- slides.view    what the viewer renders when there is no page image: {type: notebook, cells: [...]}
--                or {type: code, language, start, lines: [...]}. Word sections have a page image
--                (the document rendered to PDF) and no view.
-- materials.source  'lecturer' | 'student': student group presentations are student work, used only
--                when asked for and always labelled as such.
-- courses.elective  from course.yaml; shown as an "Elective" tag.

alter table public.slides add column label text, add column view jsonb;
alter table public.materials add column source text not null default 'lecturer' check (source in ('lecturer', 'student'));
alter table public.courses add column elective bool not null default false;

-- match_slides gains the label and the material's source (the return type changes, so drop + create).
drop function public.match_slides(uuid, extensions.vector, text, int, uuid, text[]);
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
  score           double precision,
  label           text,
  material_source text
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
         f.similarity::double precision, f.score::double precision, s.label, m.source
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
