-- Recent lectures on the dashboard (owner, 22 Nov 2026): a lecture counts as visited when the student
-- opens it, even before asking anything (a chat is only created with the first question). One row per
-- student and lecture: when they were last there and which chat they had open (null = a new, unstarted
-- chat). Students read and write only their own rows.
create table public.topic_visits (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  topic_id    uuid not null references public.topics(id) on delete cascade,
  chat_id     uuid references public.conversations(id) on delete set null,
  visited_at  timestamptz not null default now(),
  primary key (user_id, topic_id)
);
create index topic_visits_recent_idx on public.topic_visits (user_id, visited_at desc);

alter table public.topic_visits enable row level security;
create policy "own visits: read" on public.topic_visits for select to authenticated using (user_id = auth.uid());
create policy "own visits: add" on public.topic_visits for insert to authenticated with check (user_id = auth.uid());
create policy "own visits: update" on public.topic_visits for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.topic_visits to authenticated;
