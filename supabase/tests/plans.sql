-- Plans (migrations 20261113000001 + 20261113000002_manual_payments, PRD F12): daily and premium-course caps are counted atomically,
-- refused messages are free, summaries are counted for life, only an admin approval grants Finals (once per request), and
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
  i   int;
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

  -- Manual payments: a request is pending until an admin approves it; approving twice grants once.
  select * into r from create_payment_request(u, 'plans.student@pau.edu.ng', 'AYS-TST2', 3000, 'TOLU', now() - interval '1 hour', 3);
  if not r.allowed then raise exception 'FAIL: first payment request should be allowed'; end if;
  if (select count(*) from entitlements where user_id = u) <> 0 then
    raise exception 'FAIL: a request alone must never grant Finals';
  end if;
  select * into r from approve_payment_request(r.request_id, '2026-12-23 23:59:59+01', 'owner');
  e1 := r.entitlement_id;
  if r.outcome <> 'approved' then raise exception 'FAIL: approve outcome %', r.outcome; end if;
  select * into r from approve_payment_request((select id from payment_requests where user_id = u), '2026-12-23 23:59:59+01', 'owner');
  if r.outcome <> 'already_approved' or r.entitlement_id <> e1 or (select count(*) from entitlements where user_id = u) <> 1 then
    raise exception 'FAIL: approving twice must not grant a second plan';
  end if;
  if (select source from entitlements where id = e1) <> 'manual'
     or (select ends_at from entitlements where id = e1) <> '2026-12-23 23:59:59+01' then
    raise exception 'FAIL: approval should grant a manual plan until the end date';
  end if;
  if reject_payment_request((select id from payment_requests where user_id = u), 'x', 'owner') <> 'already_approved' then
    raise exception 'FAIL: an approved request must not be rejectable';
  end if;
  -- At most 3 pending requests a day; rejecting frees nothing for the day, rejected never grants.
  for i in 1..3 loop
    select * into r from create_payment_request(u, 'plans.student@pau.edu.ng', 'AYS-TST2', 5000, null, now() - interval '1 hour', 3);
    if not r.allowed then raise exception 'FAIL: pending request % of 3 should be allowed', i; end if;
  end loop;
  select * into r from create_payment_request(u, 'plans.student@pau.edu.ng', 'AYS-TST2', 5000, null, now() - interval '1 hour', 3);
  if r.allowed or r.pending_today <> 3 then raise exception 'FAIL: a 4th pending request in a day should be refused'; end if;
  if reject_payment_request(
       (select id from payment_requests where user_id = u and status = 'pending' order by created_at limit 1), ' Wrong amount ', 'owner') <> 'rejected' then
    raise exception 'FAIL: reject a pending request';
  end if;
  if (select count(*) from entitlements where user_id = u) <> 1
     or (select note from payment_requests where status = 'rejected' and user_id = u) <> 'Wrong amount' then
    raise exception 'FAIL: rejecting must not grant, and keeps the trimmed note';
  end if;
  select * into r from approve_payment_request((select id from payment_requests where status = 'rejected' and user_id = u), '2026-12-23 23:59:59+01', 'owner');
  if r.outcome <> 'rejected' then raise exception 'FAIL: a rejected request must not be approvable'; end if;
  -- A comp plan has no request; a manual plan must have one.
  insert into entitlements (user_id, plan, ends_at, source, note) values (u, 'finals', '2026-12-23 23:59:59+01', 'comp', 'tester');
  begin
    insert into entitlements (user_id, plan, ends_at, source) values (u, 'finals', '2026-12-23 23:59:59+01', 'manual');
    raise exception 'FAIL: a manual plan without a request was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into payment_references (user_id, reference) values (u, 'AYS-0OIL');
    raise exception 'FAIL: a reference with ambiguous characters was accepted';
  exception when check_violation then null;
  end;

  -- Students can't read or call any of this.
  if has_table_privilege('authenticated', 'public.entitlements', 'select')
     or has_table_privilege('anon', 'public.payment_requests', 'select')
     or has_table_privilege('authenticated', 'public.payment_references', 'select')
     or has_function_privilege('authenticated', 'public.consume_message_plan(uuid, date, int, uuid, int)', 'execute')
     or has_function_privilege('authenticated', 'public.approve_payment_request(uuid, timestamptz, text)', 'execute')
     or has_function_privilege('authenticated', 'public.create_payment_request(uuid, text, text, int, text, timestamptz, int)', 'execute') then
    raise exception 'FAIL: plan tables/functions must be service-role only';
  end if;

  -- referral_stats: approved requests and revenue per code (TOLU: one approved at 3000, none pending).
  select * into r from referral_stats where referral_code = 'TOLU';
  if r.approved <> 1 or r.revenue_naira <> 3000 or r.pending <> 0 then
    raise exception 'FAIL: referral_stats TOLU expected 1 / 3000 / 0, got % / % / %', r.approved, r.revenue_naira, r.pending;
  end if;
  select * into r from referral_stats where referral_code = '(none)';
  if r.approved <> 0 or r.pending <> 2 then
    raise exception 'FAIL: referral_stats (none) expected 0 approved / 2 pending, got % / %', r.approved, r.pending;
  end if;

  raise notice 'PASS plans: caps (20/5, premium 8/2 inside the cap, Finals 40), refunds, summaries, manual requests (pending until approved, approve once, reject, 3 pending a day), per-programme premium, privileges, referral stats';
end $$;

rollback;
