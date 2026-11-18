-- Enrol in extra courses (owner, 18 Nov 2026): a student retaking a failed course or taking an extra
-- one adds it to My courses. Only courses of their own programme (any level); enrolling is done by
-- the server (/api/enrollments, service role) after that check, so students can't insert rows here.
--
--   course_enrollments   one row per (student, extra course). The student reads and removes their own.
--   my_course_ids()      now also returns enrolled courses that are still in the student's programme,
--                        so every read policy (courses, topics, materials, slides, past papers and
--                        questions, conversations) follows without further changes. After a programme
--                        change, enrolments in the old programme stop counting (they're kept).

create table public.course_enrollments (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, course_id)
);
alter table public.course_enrollments enable row level security;
create policy "own enrollments: read" on public.course_enrollments for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own enrollments: remove" on public.course_enrollments for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.course_enrollments from anon;
revoke insert, update on public.course_enrollments from authenticated;

create or replace function public.my_course_ids() returns uuid[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(distinct c.id), '{}')
  from public.profiles p
  join public.courses c on c.institution = p.institution and c.programme = p.programme
  where p.id = (select auth.uid())
    and (c.level = p.level
         or exists (select 1 from public.course_enrollments e where e.user_id = p.id and e.course_id = c.id))
$$;
