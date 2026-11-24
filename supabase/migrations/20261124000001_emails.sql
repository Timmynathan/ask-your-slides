-- Branded update emails (owner, 24 Nov 2026). Three update emails (welcome, past questions live, new
-- slides) go through a queue so the Resend free plan (100 a day) keeps room for sign-in codes: at most
-- 90 update emails a day, 2 per student per 7 days, never to anyone who unsubscribed. Every send is
-- logged (sign-in codes too) so retention can compare emailed and not-emailed students.
-- Service role only: no policies on the new tables.

-- The "Email me updates" setting. Sign-in codes are always sent; this only stops update emails.
alter table public.profiles
  add column email_updates boolean not null default true,
  add column email_unsubscribed_at timestamptz;

create table public.email_queue (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('welcome', 'pastq', 'newslides')),
  course_id   uuid references public.courses(id) on delete cascade,
  -- One row per student per type and course per day: a second trigger the same day adds nothing.
  dedupe_key  text not null unique,
  status      text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  reason      text,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index email_queue_status_idx on public.email_queue (status, created_at);

create table public.email_sends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  type        text not null check (type in ('signin', 'welcome', 'pastq', 'newslides', 'test')),
  course_id   uuid references public.courses(id) on delete set null,
  queue_id    uuid references public.email_queue(id) on delete set null,
  resend_id   text,
  sent_at     timestamptz not null default now()
);
create index email_sends_user_idx on public.email_sends (user_id, sent_at desc);
create index email_sends_sent_idx on public.email_sends (sent_at desc);

alter table public.email_queue enable row level security;
alter table public.email_sends enable row level security;
revoke all on public.email_queue, public.email_sends from anon, authenticated;

-- Queue a course email (pastq or newslides) for every student who has chatted in the course; for past
-- questions also everyone whose programme and level include it. Returns how many were queued.
create or replace function public.enqueue_course_email(p_course uuid, p_type text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  day text := to_char(now() at time zone 'Africa/Lagos', 'YYYY-MM-DD');
begin
  if p_type not in ('pastq', 'newslides') then
    raise exception 'unknown course email type %', p_type;
  end if;
  insert into public.email_queue (user_id, type, course_id, dedupe_key)
  select u.user_id, p_type, p_course, p_type || ':' || p_course || ':' || u.user_id || ':' || day
  from (
    select distinct c.user_id from public.conversations c where c.course_id = p_course
    union
    select p.id from public.profiles p join public.courses co on co.id = p_course
    where p_type = 'pastq' and p.onboarded and p.programme = co.programme and p.level = co.level
  ) u
  join public.profiles p on p.id = u.user_id
  where p.email_updates
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Queue the welcome email for students who joined between 1 and 48 hours ago and haven't asked a
-- question yet. Once per student (dedupe key welcome:<user>). Returns how many were queued.
create or replace function public.enqueue_welcome_emails()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  insert into public.email_queue (user_id, type, dedupe_key)
  select p.id, 'welcome', 'welcome:' || p.id
  from public.profiles p
  where p.created_at <= now() - interval '1 hour'
    and p.created_at > now() - interval '48 hours'
    and p.email_updates
    and not exists (select 1 from public.messages m where m.user_id = p.id and m.role = 'user')
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.enqueue_course_email(uuid, text) from anon, authenticated, public;
revoke execute on function public.enqueue_welcome_emails() from anon, authenticated, public;
grant execute on function public.enqueue_course_email(uuid, text) to service_role;
grant execute on function public.enqueue_welcome_emails() to service_role;
