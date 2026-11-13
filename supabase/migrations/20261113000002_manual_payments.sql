-- Manual bank transfer replaces Paystack for launch (PRD F12, 13 Nov 2026).
-- A student transfers to the owner's account with their reference (AYS-XXXX) in the description,
-- sends the receipt on WhatsApp, and a payment_request waits as 'pending'. Finals is granted ONLY
-- when an admin approves it (/admin/payments). The amount is fixed when the request is created
-- (price lock): a request made before PRICE_CHANGE_DATE stays at the early price.
-- Service-role only, like the rest of the plans tables.

-- Paystack was never switched on: no payments were ever recorded.
drop view public.referral_stats;
drop function public.grant_finals(uuid, timestamptz, text, text, text);
drop table public.payments;

-- One transfer reference per student, kept for good (shown on /pay, typed into the transfer).
create table public.payment_references (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  reference   text not null unique check (reference ~ '^AYS-[2-9A-HJKMNP-Z]{4}$'),
  created_at  timestamptz not null default now()
);

create table public.payment_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  email          text not null,
  reference      text not null,
  plan           text not null default 'finals' check (plan in ('finals')),
  -- Naira, decided by the server when the request was made (price lock).
  amount_naira   int  not null check (amount_naira > 0),
  -- As typed (upper-cased); not a foreign key, so a mistyped code is still recorded.
  referral_code  text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Reason for a rejection, shown to the student.
  note           text,
  decided_by     text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null))
);
create index payment_requests_user_idx on public.payment_requests (user_id, created_at desc);
create index payment_requests_pending_idx on public.payment_requests (created_at desc) where status = 'pending';

-- Entitlements: 'manual' (an approved transfer, one per request) or 'comp'.
alter table public.entitlements drop constraint entitlements_check1;
alter table public.entitlements drop constraint entitlements_source_check;
alter table public.entitlements drop column paystack_reference;
alter table public.entitlements add column payment_request_id uuid unique references public.payment_requests(id) on delete cascade;
alter table public.entitlements add constraint entitlements_source_check check (source in ('manual', 'comp'));
alter table public.entitlements add constraint entitlements_manual_request_check check ((source = 'manual') = (payment_request_id is not null));

-- Approved requests and revenue per referral code (naira).
create view public.referral_stats with (security_invoker = true) as
  select coalesce(referral_code, '(none)') as referral_code,
         count(*) filter (where status = 'approved')                    as approved,
         coalesce(sum(amount_naira) filter (where status = 'approved'), 0) as revenue_naira,
         count(*) filter (where status = 'pending')                     as pending
  from public.payment_requests
  group by 1
  order by approved desc, 1;

alter table public.payment_references enable row level security;
alter table public.payment_requests   enable row level security;
revoke all on public.payment_references, public.payment_requests, public.referral_stats from anon, authenticated;

-- ── A student says "I've sent it" ───────────────────────────────────────
-- At most p_max_pending pending requests since p_since (the start of the Lagos day, decided by the
-- server). One lock per student, so a double tap can't slip past the limit.
create or replace function public.create_payment_request(
  p_user_id uuid, p_email text, p_reference text, p_amount int, p_referral text,
  p_since timestamptz, p_max_pending int)
returns table (allowed boolean, request_id uuid, pending_today int)
language plpgsql security definer set search_path = '' as $$
declare
  v_pending int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('payreq:' || p_user_id::text, 0));
  select count(*) into v_pending from public.payment_requests r
  where r.user_id = p_user_id and r.status = 'pending' and r.created_at >= p_since;
  if v_pending >= p_max_pending then
    return query select false, null::uuid, v_pending;
    return;
  end if;
  insert into public.payment_requests (user_id, email, reference, amount_naira, referral_code)
  values (p_user_id, p_email, p_reference, p_amount, p_referral)
  returning id into v_id;
  return query select true, v_id, v_pending + 1;
end $$;

-- ── Admin decisions ─────────────────────────────────────────────────────
-- Approve: one Finals plan per request, whatever the number of clicks (the row lock queues a
-- double click; the second sees 'approved' and gets the same entitlement back).
-- outcome: approved | already_approved | rejected | not_found
create or replace function public.approve_payment_request(p_request_id uuid, p_ends_at timestamptz, p_admin text)
returns table (outcome text, entitlement_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v public.payment_requests%rowtype;
  v_ent uuid;
begin
  select * into v from public.payment_requests r where r.id = p_request_id for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v.status = 'approved' then
    return query select 'already_approved'::text, (select e.id from public.entitlements e where e.payment_request_id = v.id);
    return;
  end if;
  if v.status = 'rejected' then
    return query select 'rejected'::text, null::uuid;
    return;
  end if;
  insert into public.entitlements (user_id, plan, ends_at, source, payment_request_id)
  values (v.user_id, 'finals', p_ends_at, 'manual', v.id)
  returning id into v_ent;
  update public.payment_requests set status = 'approved', decided_at = now(), decided_by = p_admin
  where id = v.id;
  return query select 'approved'::text, v_ent;
end $$;

-- Reject a pending request (an approved one can't be rejected here).
-- Returns: rejected | already_rejected | already_approved | not_found
create or replace function public.reject_payment_request(p_request_id uuid, p_note text, p_admin text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  select r.status into v_status from public.payment_requests r where r.id = p_request_id for update;
  if v_status is null then return 'not_found'; end if;
  if v_status <> 'pending' then return 'already_' || v_status; end if;
  update public.payment_requests
  set status = 'rejected', note = nullif(btrim(p_note), ''), decided_at = now(), decided_by = p_admin
  where id = p_request_id;
  return 'rejected';
end $$;

revoke execute on function public.create_payment_request(uuid, text, text, int, text, timestamptz, int) from anon, authenticated, public;
revoke execute on function public.approve_payment_request(uuid, timestamptz, text) from anon, authenticated, public;
revoke execute on function public.reject_payment_request(uuid, text, text) from anon, authenticated, public;
grant execute on function public.create_payment_request(uuid, text, text, int, text, timestamptz, int) to service_role;
grant execute on function public.approve_payment_request(uuid, timestamptz, text) to service_role;
grant execute on function public.reject_payment_request(uuid, text, text) to service_role;
grant select, insert, update, delete on public.payment_references, public.payment_requests to service_role;
grant select on public.referral_stats to service_role;
