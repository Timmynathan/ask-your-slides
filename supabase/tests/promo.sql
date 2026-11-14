-- Promo codes (migration 20261114000001, PRD F12): one code = one student, once; one promo per
-- student; a student already on Finals keeps the code unused; Finals lasts the code's days.
-- Run: npm run test:db (rolled back at the end).
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
begin;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'promo.rep1@pau.edu.ng', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'promo.rep2@pau.edu.ng', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000a3', 'promo.paid@pau.edu.ng', 'authenticated', 'authenticated', now(), now());

insert into promo_codes (code, days, note, created_by) values
  ('REP-TEST-0001', 7, 'test rep 1', 'owner@test'),
  ('REP-TEST-0002', 7, 'test rep 2', 'owner@test'),
  ('REP-TEST-0003', 3, 'test rep 3', 'owner@test');

do $$
declare
  rep1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  rep2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  paid constant uuid := '00000000-0000-0000-0000-0000000000a3';
  t    constant timestamptz := '2026-11-16 10:00+01';
  r    record;
begin
  -- Redeem: Finals for 7 days, typed in lower case with spaces.
  select * into r from redeem_promo_code(rep1, 'Promo.Rep1@pau.edu.ng', '  rep-test-0001 ', t);
  if r.outcome <> 'redeemed' or r.ends_at <> t + interval '7 days' then
    raise exception 'FAIL: expected redeemed until +7 days, got % %', r.outcome, r.ends_at;
  end if;
  if not exists (select 1 from entitlements where user_id = rep1 and source = 'promo' and ends_at = t + interval '7 days') then
    raise exception 'FAIL: no promo entitlement';
  end if;
  if (select redeemed_email from promo_codes where code = 'REP-TEST-0001') <> 'promo.rep1@pau.edu.ng' then
    raise exception 'FAIL: redeemed email not recorded';
  end if;

  -- The same code again: the same student is told it's theirs; anyone else is told it's used.
  select * into r from redeem_promo_code(rep1, 'x', 'REP-TEST-0001', t);
  if r.outcome <> 'already_yours' then raise exception 'FAIL: expected already_yours, got %', r.outcome; end if;
  select * into r from redeem_promo_code(rep2, 'x', 'REP-TEST-0001', t);
  if r.outcome <> 'used' then raise exception 'FAIL: expected used, got %', r.outcome; end if;

  -- One promo per student, even after the first one has ended.
  select * into r from redeem_promo_code(rep1, 'x', 'REP-TEST-0002', t + interval '30 days');
  if r.outcome <> 'one_per_student' then raise exception 'FAIL: expected one_per_student, got %', r.outcome; end if;

  -- A paying student keeps the code unused.
  insert into entitlements (user_id, plan, starts_at, ends_at, source, note) values (paid, 'finals', t - interval '1 day', t + interval '30 days', 'comp', 'test');
  select * into r from redeem_promo_code(paid, 'x', 'REP-TEST-0002', t);
  if r.outcome <> 'already_finals' then raise exception 'FAIL: expected already_finals, got %', r.outcome; end if;
  if (select redeemed_at from promo_codes where code = 'REP-TEST-0002') is not null then
    raise exception 'FAIL: the code was used up by a student already on Finals';
  end if;

  -- The code's own length, and unknown codes.
  select * into r from redeem_promo_code(rep2, 'x', 'REP-TEST-0003', t);
  if r.outcome <> 'redeemed' or r.ends_at <> t + interval '3 days' then raise exception 'FAIL: expected 3 days, got % %', r.outcome, r.ends_at; end if;
  select * into r from redeem_promo_code(rep2, 'x', 'NOPE-0000', t);
  if r.outcome <> 'not_found' then raise exception 'FAIL: expected not_found, got %', r.outcome; end if;

  -- Students can't read the codes or call the function.
  if has_table_privilege('authenticated', 'public.promo_codes', 'select')
     or has_function_privilege('authenticated', 'public.redeem_promo_code(uuid, text, text, timestamptz)', 'execute') then
    raise exception 'FAIL: promo codes must be service-role only';
  end if;

  raise notice 'PASS promo: redeem once, used/already_yours, one per student, already on Finals keeps the code, code length, not found, privileges';
end $$;

rollback;
