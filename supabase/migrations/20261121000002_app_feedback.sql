-- General feedback from the sidebar's Feedback button (owner, 20 Nov 2026): what the student wrote,
-- Good/Bad, and the features it's about. Students can only add their own; only the server (the admin
-- page, service role) reads them. Separate from public.feedback (thumbs on one answer).
create table public.app_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 2000),
  sentiment   text check (sentiment in ('good', 'bad')),
  features    text[] not null default '{}',
  page        text check (char_length(page) <= 200),
  created_at  timestamptz not null default now()
);
create index app_feedback_created_idx on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;
create policy "own feedback: add" on public.app_feedback for insert to authenticated with check (user_id = auth.uid());
grant insert on public.app_feedback to authenticated;
