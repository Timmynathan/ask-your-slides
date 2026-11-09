-- Multi-department catalog (data/<institution>/catalog.yaml).
--
-- A course is unique per (institution, programme, code), not by code alone: the same code (e.g.
-- INS401) can exist in several programmes with different files. Materials belong to a course
-- session (e.g. 2026-2027). Slide keys stay short (CSC420-02-12) and are unique within a course;
-- the course is always known wherever a key is used (chat, slide viewer).
--
-- Existing rows are the final-year Computer Science courses (pau / sst / computer-science, 400
-- level, first semester, 2026-2027). Ingestion keeps every field in sync from course.yaml.

-- ── courses ─────────────────────────────────────────────────
alter table public.courses
  add column institution    text,
  add column school         text,
  add column programme      text,
  add column level          int,
  add column semester       int,
  add column session        text,
  add column aliases        text[] not null default '{}',
  add column lms_course_id  int;

do $$
begin
  if exists (select 1 from public.courses where department <> 'Computer Science') then
    raise exception 'backfill assumes every existing course is Computer Science; set the new columns by hand first';
  end if;
end $$;

update public.courses
set institution = 'pau', school = 'sst', programme = 'computer-science', level = 400, semester = 1, session = '2026-2027'
where institution is null;

alter table public.courses
  alter column institution set not null,
  alter column school      set not null,
  alter column programme   set not null,
  alter column level       set not null,
  alter column semester    set not null,
  alter column session     set not null,
  add constraint courses_slug_check check (
    institution ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and school ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and programme ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint courses_level_check check (level between 100 and 900 and level % 100 = 0),
  add constraint courses_semester_check check (semester in (1, 2)),
  add constraint courses_session_check check (session ~ '^[0-9]{4}-[0-9]{4}$'),
  add constraint courses_aliases_check check (cardinality(aliases) = 0 or array_to_string(aliases, ',') ~ '^[A-Z]{3}[0-9]{3}(,[A-Z]{3}[0-9]{3})*$');

alter table public.courses drop constraint courses_code_key;
alter table public.courses add constraint courses_institution_programme_code_key unique (institution, programme, code);
create index courses_code_idx on public.courses (code);

-- ── course sessions ────────────────────────────────────────
create table public.course_sessions (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  session        text not null check (session ~ '^[0-9]{4}-[0-9]{4}$'),   -- e.g. 2026-2027
  lms_course_id  int,
  created_at     timestamptz not null default now(),
  unique (course_id, session),
  unique (id, course_id)            -- target for the "session belongs to this course" FK below
);

alter table public.course_sessions enable row level security;
create policy "signed-in users read course sessions" on public.course_sessions for select to authenticated using (true);
revoke all on public.course_sessions from anon;
revoke insert, update, delete on public.course_sessions from authenticated;

insert into public.course_sessions (course_id, session, lms_course_id)
select id, session, lms_course_id from public.courses
on conflict (course_id, session) do nothing;

-- ── materials belong to a course session ───────────────────
alter table public.materials add column course_session_id uuid;
update public.materials m
set course_session_id = s.id
from public.courses c join public.course_sessions s on s.course_id = c.id and s.session = c.session
where m.course_id = c.id and m.course_session_id is null;
alter table public.materials
  alter column course_session_id set not null,
  add constraint materials_course_session_fk foreign key (course_session_id, course_id)
    references public.course_sessions (id, course_id) on delete cascade;
create index materials_course_session_idx on public.materials (course_session_id);

-- An LMS id identifies a material within its course session, not across the whole catalog.
alter table public.materials drop constraint materials_lms_cmid_key;
alter table public.materials add constraint materials_session_lms_cmid_key unique (course_session_id, lms_cmid);

-- ── slide keys: unique per course ──────────────────────────
alter table public.slides drop constraint slides_slide_key_key;
alter table public.slides add constraint slides_course_slide_key_key unique (course_id, slide_key);
