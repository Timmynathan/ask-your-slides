-- Several programmes (PRD F11): a student picks a programme + level; they see only its courses.
--
--   programmes            name, department, school (from catalog.yaml, kept in sync by ingestion).
--                         Signed-in users read; service role writes.
--   profiles.programme    + level (and institution). Existing accounts (all Computer Science) are set
--                         to computer-science / 400. Null until onboarding for new students.
--   my_course_ids()       the courses of the student's programme + level. Every course-scoped table's
--                         read policy uses it, so isolation holds in the database, not just the UI:
--                         courses, course_sessions, topics, materials, slides, past papers/questions,
--                         and the student's own conversations (a chat in a course they no longer see
--                         is hidden, and a new one can only be started in a visible course).
--   programme_choices()   what onboarding can offer: every programme + level that has courses
--                         (not limited by the student's own programme).

-- ── programmes ─────────────────────────────────────────────
create table public.programmes (
  institution  text not null,
  id           text not null,                 -- e.g. computer-science
  name         text not null,                 -- e.g. BSc Computer Science
  short_name   text,                          -- e.g. ISMS
  department   text not null,                 -- e.g. Computer Science
  school       text not null,                 -- e.g. sst
  school_name  text,
  sort_order   int  not null default 0,
  primary key (institution, id),
  check (institution ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
alter table public.programmes enable row level security;
create policy "signed-in users read programmes" on public.programmes for select to authenticated using (true);
revoke all on public.programmes from anon;
revoke insert, update, delete on public.programmes from authenticated;

-- The two programmes in the catalog today (ingestion keeps names in sync from catalog.yaml).
insert into public.programmes (institution, id, name, short_name, department, school, school_name, sort_order) values
  ('pau', 'computer-science', 'BSc Computer Science', null, 'Computer Science', 'sst', 'School of Science and Technology', 1),
  ('pau', 'information-science-and-media-studies', 'BSc Information Science and Media Studies', 'ISMS',
   'Information Science and Media Studies', 'smc', 'School of Media and Communication', 2)
on conflict do nothing;

-- ── profiles: programme + level ────────────────────────────
alter table public.profiles drop constraint if exists profiles_department_check;  -- departments now come from the data
alter table public.profiles
  add column institution text not null default 'pau',
  add column programme   text,
  add column level       int check (level between 100 and 900 and level % 100 = 0),
  add constraint profiles_programme_fkey foreign key (institution, programme) references public.programmes (institution, id),
  add constraint profiles_level_with_programme check ((programme is null) = (level is null));

-- Every account so far is a final-year Computer Science student.
update public.profiles set programme = 'computer-science', level = 400, department = 'Computer Science' where programme is null;

grant update (programme, level) on public.profiles to authenticated;

-- ── what a student can see ─────────────────────────────────
create function public.my_course_ids() returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(c.id), '{}')
  from public.profiles p
  join public.courses c on c.institution = p.institution and c.programme = p.programme and c.level = p.level
  where p.id = (select auth.uid())
$$;
revoke all on function public.my_course_ids() from public, anon;
grant execute on function public.my_course_ids() to authenticated;

create function public.programme_choices()
returns table (programme text, name text, short_name text, department text, level int)
language sql stable security definer set search_path = public
as $$
  select distinct p.id, p.name, p.short_name, p.department, c.level
  from public.programmes p
  join public.courses c on c.institution = p.institution and c.programme = p.id
  order by p.id, c.level
$$;
revoke all on function public.programme_choices() from public, anon;
grant execute on function public.programme_choices() to authenticated;

-- (select …) makes Postgres compute the list once per query, not once per row.
drop policy "signed-in users read courses" on public.courses;
create policy "own programme: courses" on public.courses for select to authenticated
  using (id = any ((select public.my_course_ids())::uuid[]));

drop policy "signed-in users read course sessions" on public.course_sessions;
create policy "own programme: course sessions" on public.course_sessions for select to authenticated
  using (course_id = any ((select public.my_course_ids())::uuid[]));

drop policy "signed-in users read topics" on public.topics;
create policy "own programme: topics" on public.topics for select to authenticated
  using (course_id = any ((select public.my_course_ids())::uuid[]));

drop policy "signed-in users read materials" on public.materials;
create policy "own programme: materials" on public.materials for select to authenticated
  using (course_id = any ((select public.my_course_ids())::uuid[]));

drop policy "signed-in users read slides" on public.slides;
create policy "own programme: slides" on public.slides for select to authenticated
  using (course_id = any ((select public.my_course_ids())::uuid[]));

drop policy "signed-in users read reviewed papers" on public.past_papers;
create policy "own programme: reviewed papers" on public.past_papers for select to authenticated
  using (status = 'ok' and course_id = any ((select public.my_course_ids())::uuid[]));

drop policy "signed-in users read reviewed questions" on public.past_questions;
create policy "own programme: reviewed questions" on public.past_questions for select to authenticated
  using (course_id = any ((select public.my_course_ids())::uuid[])
         and (origin = 'generated' or exists (select 1 from public.past_papers p where p.id = paper_id and p.status = 'ok')));

drop policy "own conversations" on public.conversations;
create policy "own conversations" on public.conversations for all to authenticated
  using (user_id = (select auth.uid()) and course_id = any ((select public.my_course_ids())::uuid[]))
  with check (user_id = (select auth.uid()) and course_id = any ((select public.my_course_ids())::uuid[]));
