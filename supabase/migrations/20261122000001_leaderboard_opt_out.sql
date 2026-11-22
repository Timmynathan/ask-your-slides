-- "Show me on the leaderboard" (owner, 22 Nov 2026): students can hide from the study streak
-- leaderboard in Settings. On by default; the student can change only their own row (RLS) and only
-- this column (grant).
alter table public.profiles add column if not exists show_on_leaderboard boolean not null default true;
grant update (show_on_leaderboard) on public.profiles to authenticated;
