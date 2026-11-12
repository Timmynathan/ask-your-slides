-- Plans (migration 20261113000001, PRD F12): daily and premium-course caps are counted atomically,
-- refused messages are free, summaries are counted for life, a Paystack reference grants once, and
-- the premium flag belongs to the programme's course row. Caps are passed in by the server
-- (lib/plans/config.ts); the values below are the launch values.
-- Run: npm run test:db (rolled back at the end).
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
begin;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'plans.student@pau.edu.ng', 'authenticated', 'authenticated', now(), now());
insert into programmes (institution, id, name, department, school, sort_order) values
  ('pau', 'test-plans-cs',  'BSc Test CS',  'Test CS',  'sst', 995),
  ('pau', 'test-plans-sen', 'BSc Test SEN', 'Test SEN', 'sst', 996)
  on conflict do nothing;
-- The same code in two programmes, premium in only one (like CSC409: SEN yes, CS no).
insert into courses (id, institution, school, programme, level, semester, session, code, title, department, sort_order, premium) values
  ('f0000000-0000-0000-0000-000000000001', 'pau', 'sst', 'test-plans-cs',  400, 1, '2026-2027', 'TPL409', 'Shared Fixture', 'Test CS',  997, false),
  ('f0000000-0000-0000-0000-000000000002', 'pau', 'sst', 'test-plans-sen', 400, 1, '2026-2027', 'TPL409', 'Shared Fixture', 'Test SEN', 998, true),
  ('f0000000-0000-0000-0000-000000000003', 'pau', 'sst', 'test-plans-cs',  400, 1, '2026-2027', 'TPL410', 'Other Fixture',  'Test CS',  999, false);

do $$
declare
  u   constant uuid := '00000000-0000-0000-0000-0000000000f1';
  cs  constant uuid := 'f0000000-0000-0000-0000-000000000001';
  sen constant uuid := 'f0000000-0000-0000-0000-000000000002';
  oth constant uuid := 'f0000000-0000-0000-0000-000000000003';
  d1  constant date := '2026-11-16';
  d2  constant date := '2026-11-17';
  r   record;
  n   int;
  ok  int;
  e1  uuid;
  e2  uuid;
begin
  -- Premium belongs to the programme's row, not to the code.
  if (select premium from courses where id = cs) or not (select premium from courses where id = sen) then
    raise exception 'FAIL: premium flag should be per programme course row';
  end if;
  if (select premium from courses where id = oth) then raise exception 'FAIL: premium should default to false'; end if;

  -- Day 1 (Free, first day): cap 20, premium course 8, inside the daily cap.
  ok := 0;
  for n in 1..10 loop
    select * into r from consume_message_plan(u, d1, 20, sen, 8);
    if r.allowed then ok := ok + 1; end if;
  end loop;
  if ok <> 8 then raise exception 'FAIL: premium course day 1 should allow 8, allowed %', ok; end if;
  if r.reason <> 'premium_cap' then raise exception 'FAIL: 9th premium question should be premium_cap, got %', r.reason; end if;
  if (select message_count from usage_daily where user_id = u and day = d1) <> 8 then
    raise exception 'FAIL: refused premium questions must not count towards the daily cap';
  end if;
  -- The same code in the other programme is not premium: no course cap, only the daily cap left (12).
  ok := 0;
  for n in 1..15 loop
    select * into r from consume_message_plan(u, d1, 20, cs, null);
    if r.allowed then ok := ok + 1; end if;
  end loop;
  if ok <> 12 then raise exception 'FAIL: daily cap 20 should leave 12 after 8 premium, allowed %', ok; end if;
  if r.reason <> 'daily_cap' or r.used <> 20 then raise exception 'FAIL: expected daily_cap at 20, got % / %', r.reason, r.used; end if;

  -- Day 2 (Free): cap 5, premium 2 — a new Lagos day starts from zero.
  ok := 0;
  for n in 1..4 loop
    select * into r from consume_message_plan(u, d2, 5, sen, 2);
    if r.allowed then ok := ok + 1; end if;
  end loop;
  if ok <> 2 or r.reason <> 'premium_cap' then raise exception 'FAIL: day 2 premium should allow 2, allowed % (%)', ok, r.reason; end if;
  ok := 0;
  for n in 1..5 loop
    select * into r from consume_message_plan(u, d2, 5, oth, null);
    if r.allowed then ok := ok + 1; end if;
  end loop;
  if ok <> 3 then raise exception 'FAIL: day 2 cap 5 should leave 3 after 2 premium, allowed %', ok; end if;

  -- Refund gives back both counts.
  perform refund_message_plan(u, d2, sen);
  if (select message_count from usage_daily where user_id = u and day = d2) <> 4
     or (select message_count from usage_course_daily where user_id = u and day = d2 and course_id = sen) <> 1 then
    raise exception 'FAIL: refund should take one off the daily and the course count';
  end if;

  -- Finals (40, no course cap) on a day already used on Free: the higher cap applies straight away.
  ok := 0;
  for n in 1..45 loop
    select * into r from consume_message_plan(u, d2, 40, sen, null);
    if r.allowed then ok := ok + 1; end if;
  end loop;
  if ok <> 36 then raise exception 'FAIL: Finals cap 40 with 4 used should allow 36, allowed %', ok; end if;

  -- Summaries: Free gets 1 in total; unlimited (null) always allowed and recorded.
  select * into r from consume_summary(u, cs, 1);
  if not r.allowed then raise exception 'FAIL: first summary should be allowed'; end if;
  select * into r from consume_summary(u, sen, 1);
  if r.allowed then raise exception 'FAIL: second summary on Free should be refused'; end if;
  select * into r from consume_summary(u, sen, null);
  if not r.allowed or r.used <> 2 then raise exception 'FAIL: unlimited summaries should be allowed and counted'; end if;

  -- A Paystack reference grants once, however many times the webhook/verify arrive.
  e1 := grant_finals(u, '2026-12-23 23:59:59+01', 'paystack', 'ref_test_1', null);
  e2 := grant_finals(u, '2026-12-23 23:59:59+01', 'paystack', 'ref_test_1', null);
  if e1 is null or e1 <> e2 or (select count(*) from entitlements where user_id = u) <> 1 then
    raise exception 'FAIL: replaying a reference must not grant a second plan';
  end if;
  -- A comp grant has no reference; a Paystack grant must have one.
  perform grant_finals(u, '2026-12-23 23:59:59+01', 'comp', null, 'tester');
  begin
    perform grant_finals(u, '2026-12-23 23:59:59+01', 'paystack', null, null);
    raise exception 'FAIL: a paystack grant without a reference was accepted';
  exception when check_violation then null;
  end;

  -- Students can't read or call any of this.
  if has_table_privilege('authenticated', 'public.entitlements', 'select')
     or has_table_privilege('anon', 'public.payments', 'select')
     or has_function_privilege('authenticated', 'public.consume_message_plan(uuid, date, int, uuid, int)', 'execute')
     or has_function_privilege('authenticated', 'public.grant_finals(uuid, timestamptz, text, text, text)', 'execute') then
    raise exception 'FAIL: plan tables/functions must be service-role only';
  end if;

  -- referral_stats: paid count and revenue per code.
  insert into payments (user_id, reference, plan, amount_kobo, status, referral_code) values
    (u, 'ref_a', 'finals', 300000, 'success', 'TOLU'),
    (u, 'ref_b', 'finals', 500000, 'success', 'TOLU'),
    (u, 'ref_c', 'finals', 300000, 'pending', 'TOLU');
  select * into r from referral_stats where referral_code = 'TOLU';
  if r.paid <> 2 or r.revenue_naira <> 8000 or r.pending <> 1 then
    raise exception 'FAIL: referral_stats TOLU expected 2 paid / 8000 / 1 pending, got % / % / %', r.paid, r.revenue_naira, r.pending;
  end if;

  raise notice 'PASS plans: caps (20/5, premium 8/2 inside the cap, Finals 40), refunds, summaries, grant once, per-programme premium, privileges, referral stats';
end $$;

rollback;
