-- Plans and payments (PRD F12, Nov 2026): Free and Finals. The numbers (caps, prices, dates) live in
-- apps/web/lib/plans/config.ts and are passed in by the server; these tables and functions only
-- count and record. Every table here is service-role only (RLS on, no policies, grants revoked).

-- Premium courses: course.yaml premium: true, per programme (the same code can differ).
alter table public.courses add column premium boolean not null default false;

-- ── Plans a student holds ────────────────────────────────────────────────
create table public.entitlements (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  plan                text not null check (plan in ('finals')),
  starts_at           timestamptz not null default now(),
  ends_at             timestamptz not null,
  source              text not null check (source in ('paystack', 'comp')),
  -- One plan per Paystack payment: a replayed webhook can't grant twice.
  paystack_reference  text unique,
  note                text,
  created_at          timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((source = 'paystack') = (paystack_reference is not null))
);
create index entitlements_user_idx on public.entitlements (user_id, ends_at);

create table public.referral_codes (
  code        text primary key check (code ~ '^[A-Z0-9_-]{2,32}$'),
  owner_name  text,
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  reference      text not null unique,
  plan           text not null check (plan in ('finals')),
  amount_kobo    int  not null check (amount_kobo > 0),   -- what the server asked for at checkout
  currency       text not null default 'NGN',
  status         text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  -- As typed at checkout (upper-cased); not a foreign key, so a mistyped code is still recorded.
  referral_code  text,
  raw_event      jsonb,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);
create index payments_user_idx on public.payments (user_id, created_at);

-- Paid count and revenue per referral code (naira).
create view public.referral_stats with (security_invoker = true) as
  select coalesce(referral_code, '(none)') as referral_code,
         count(*) filter (where status = 'success')                        as paid,
         coalesce(sum(amount_kobo) filter (where status = 'success'), 0) / 100 as revenue_naira,
         count(*) filter (where status = 'pending')                        as pending
  from public.payments
  group by 1
  order by paid desc, 1;

-- Every time a limit or lock stops a student.
create table public.limit_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  plan        text not null,
  course_id   uuid references public.courses(id) on delete set null,
  -- daily_cap | premium_cap | summary | quiz
  feature     text not null,
  created_at  timestamptz not null default now()
);
create index limit_events_created_idx on public.limit_events (created_at);

-- ── Counters ────────────────────────────────────────────────────────────
-- Questions per premium course per Lagos day (usage_daily keeps the overall daily count).
create table public.usage_course_daily (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  day            date not null,
  course_id      uuid not null references public.courses(id) on delete cascade,
  message_count  int  not null default 0,
  primary key (user_id, day, course_id)
);

-- One row per summary a student asked for (Free gets FREE_SUMMARIES in total, ever).
create table public.summary_uses (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid references public.courses(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index summary_uses_user_idx on public.summary_uses (user_id);

alter table public.entitlements       enable row level security;
alter table public.referral_codes     enable row level security;
alter table public.payments           enable row level security;
alter table public.limit_events       enable row level security;
alter table public.usage_course_daily enable row level security;
alter table public.summary_uses       enable row level security;
revoke all on public.entitlements, public.referral_codes, public.payments, public.limit_events,
              public.usage_course_daily, public.summary_uses, public.referral_stats
  from anon, authenticated;

-- ── Taking one message from the allowance ────────────────────────────────
-- p_day is the Lagos calendar day, decided by the server (lib/plans/time.ts).
-- p_course_cap null = no per-course limit (not premium, or Finals).
-- Refused messages are not counted. One lock per student, so parallel requests queue.
create or replace function public.consume_message_plan(
  p_user_id uuid, p_day date, p_cap int, p_course_id uuid, p_course_cap int)
returns table (allowed boolean, reason text, used int, course_used int)
language plpgsql security definer set search_path = '' as $$
declare
  v_used int;
  v_course int;
begin
  perform pg_advisory_xact_lock(hashtextextended('usage:' || p_user_id::text, 0));

  select coalesce((select u.message_count from public.usage_daily u
                   where u.user_id = p_user_id and u.day = p_day), 0) into v_used;
  select coalesce((select c.message_count from public.usage_course_daily c
                   where c.user_id = p_user_id and c.day = p_day and c.course_id = p_course_id), 0) into v_course;

  if v_used >= p_cap then
    return query select false, 'daily_cap'::text, v_used, v_course;
    return;
  end if;
  if p_course_cap is not null and v_course >= p_course_cap then
    return query select false, 'premium_cap'::text, v_used, v_course;
    return;
  end if;

  insert into public.usage_daily as u (user_id, day, message_count) values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update set message_count = u.message_count + 1;
  if p_course_id is not null then
    insert into public.usage_course_daily as c (user_id, day, course_id, message_count)
    values (p_user_id, p_day, p_course_id, 1)
    on conflict (user_id, day, course_id) do update set message_count = c.message_count + 1;
  end if;
  return query select true, null::text, v_used + 1, v_course + (case when p_course_id is null then 0 else 1 end);
end $$;

-- A turn that produced nothing: give the message back (daily and per-course).
create or replace function public.refund_message_plan(p_user_id uuid, p_day date, p_course_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.usage_daily set message_count = greatest(message_count - 1, 0)
  where user_id = p_user_id and day = p_day;
  update public.usage_course_daily set message_count = greatest(message_count - 1, 0)
  where user_id = p_user_id and day = p_day and course_id = p_course_id;
$$;

-- Summaries: p_limit null = unlimited (still recorded). Returns the id so a failed turn can refund it.
create or replace function public.consume_summary(p_user_id uuid, p_course_id uuid, p_limit int)
returns table (allowed boolean, used int, use_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_used int;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('summary:' || p_user_id::text, 0));
  select count(*) into v_used from public.summary_uses s where s.user_id = p_user_id;
  if p_limit is not null and v_used >= p_limit then
    return query select false, v_used, null::bigint;
    return;
  end if;
  insert into public.summary_uses (user_id, course_id) values (p_user_id, p_course_id) returning id into v_id;
  return query select true, v_used + 1, v_id;
end $$;

-- Finals is granted once per Paystack reference, or as a comp. Returns the entitlement id
-- (existing one when the reference was already granted: webhook and verify can both arrive).
create or replace function public.grant_finals(
  p_user_id uuid, p_ends_at timestamptz, p_source text, p_reference text, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.entitlements (user_id, plan, ends_at, source, paystack_reference, note)
  values (p_user_id, 'finals', p_ends_at, p_source, p_reference, p_note)
  on conflict (paystack_reference) do nothing
  returning id into v_id;
  if v_id is null then
    select e.id into v_id from public.entitlements e where e.paystack_reference = p_reference;
  end if;
  return v_id;
end $$;

revoke execute on function public.consume_message_plan(uuid, date, int, uuid, int) from anon, authenticated, public;
revoke execute on function public.refund_message_plan(uuid, date, uuid) from anon, authenticated, public;
revoke execute on function public.consume_summary(uuid, uuid, int) from anon, authenticated, public;
revoke execute on function public.grant_finals(uuid, timestamptz, text, text, text) from anon, authenticated, public;
grant execute on function public.consume_message_plan(uuid, date, int, uuid, int) to service_role;
grant execute on function public.refund_message_plan(uuid, date, uuid) to service_role;
grant execute on function public.consume_summary(uuid, uuid, int) to service_role;
grant execute on function public.grant_finals(uuid, timestamptz, text, text, text) to service_role;
grant select, insert, update, delete on public.entitlements, public.referral_codes, public.payments,
  public.limit_events, public.usage_course_daily, public.summary_uses to service_role;
grant select on public.referral_stats to service_role;
