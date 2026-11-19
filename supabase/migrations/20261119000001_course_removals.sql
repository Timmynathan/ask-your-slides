-- Remove a course from My courses (owner, 19 Nov 2026): e.g. a carryover student who doesn't take
-- every course of their level. One row per (student, course of their own level) they removed; the
-- dashboard hides it, and "Add a course" brings it back (deletes the row). Courses added from other
-- levels are removed by deleting their course_enrollments row instead.
--
-- Hiding only: my_course_ids() is unchanged, so the course still opens from a link and its chats
-- are kept. Written by the server (/api/enrollments, service role) after its checks.

create table public.course_removals (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, course_id)
);
alter table public.course_removals enable row level security;
create policy "own removals: read" on public.course_removals for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.course_removals from anon;
revoke insert, update, delete on public.course_removals from authenticated;
