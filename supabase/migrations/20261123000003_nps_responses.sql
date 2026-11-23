-- "How likely are you to recommend Ask Your Slides to a friend?" (owner, 23 Nov 2026): the 0-10 card that
-- pops up after a student's 3rd answer of a day (components/feedback/nps-card.tsx), and its optional
-- reason. Students can add and complete their own; reading is for the admin (service role).
create table public.nps_responses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  score      smallint not null check (score between 0 and 10),
  reason     text check (reason is null or char_length(reason) <= 1000),
  page       text,
  created_at timestamptz not null default now()
);
create index nps_responses_created_idx on public.nps_responses (created_at desc);

alter table public.nps_responses enable row level security;
create policy "own nps: add" on public.nps_responses for insert to authenticated with check (user_id = auth.uid());
create policy "own nps: add reason" on public.nps_responses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own nps: read back" on public.nps_responses for select to authenticated using (user_id = auth.uid());
grant insert, update (reason), select on public.nps_responses to authenticated;
