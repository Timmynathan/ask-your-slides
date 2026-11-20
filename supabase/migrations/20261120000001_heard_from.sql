-- How the student heard about Ask Your Slides, asked once at sign-up (owner, 20 Nov 2026).
-- Null = signed up before the question existed. The options live in apps/web/lib/heard-from.ts.
alter table public.profiles
  add column heard_from text check (heard_from in ('friend', 'course_rep', 'tiktok', 'snapchat', 'other'));

grant update (heard_from) on public.profiles to authenticated;
