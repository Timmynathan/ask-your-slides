-- Past questions proof (PRD F10, §11.1): integrity, review gate, hidden answers, own attempts.
-- Run: npm run test:db   (psql against DATABASE_URL; everything is rolled back at the end)
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
begin;

-- ── Fixtures (fake course codes, so real data never interferes) ──
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'carol@pau.edu.ng', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000d1', 'dan@pau.edu.ng',   'authenticated', 'authenticated', now(), now());

insert into courses (id, institution, school, programme, level, semester, session, code, title, department, sort_order) values
  ('a0000000-0000-0000-0000-000000000001', 'pau', 'sst', 'computer-science', 400, 1, '2026-2027', 'TST901', 'Test Course', 'Computer Science', 901),
  ('a0000000-0000-0000-0000-000000000002', 'pau', 'sst', 'computer-science', 400, 1, '2026-2027', 'TST902', 'Other Course', 'Computer Science', 902);

insert into topics (id, course_id, topic_order, title) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 'Topic one');

insert into past_papers (id, course_id, session, type, code_on_paper, source_file, file_hash, status, total_marks) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2025/2026', 'exam', 'TST 801', 'x/ok.pdf',  'h1', 'ok', 60),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2024/2025', 'exam', null,      'x/bad.pdf', 'h2', 'needs_review', 60);

insert into past_questions (id, course_id, paper_id, number, text, marks, type, model_answer, marking_scheme, sort_order) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Q1', 'Explain X.', 10, 'explain', 'SECRET ANSWER', '[{"point":"p","marks":10}]', 1),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'Q1', 'Unreviewed.', 10, 'explain', null, null, 1);
insert into past_questions (id, course_id, paper_id, origin, number, text, marks, type, options, answer_key, sort_order) values
  ('a3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', null, 'generated', 'P1', 'Pick one.', 1, 'mcq', '[{"label":"A","text":"a"},{"label":"B","text":"b"}]', 'B', 2);
insert into past_questions (id, course_id, paper_id, number, parent_id, text, marks, type, sort_order) values
  ('a3000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Q1a', 'a3000000-0000-0000-0000-000000000001', 'Part a.', 4, 'define', 3);
insert into question_topics values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001');

-- ── Integrity ──────────────────────────────────────────────
do $$ begin
  begin
    insert into past_questions (course_id, paper_id, number, text, type) values
      ('a0000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'Q9', 't', 'explain');
    raise exception 'FAIL: question accepted a paper from another course';
  exception when foreign_key_violation then null; end;
  begin
    insert into past_questions (course_id, paper_id, number, text, type) values
      ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Q1', 'dup', 'explain');
    raise exception 'FAIL: duplicate question number in one paper';
  exception when unique_violation then null; end;
  begin
    insert into past_questions (course_id, paper_id, origin, number, text, type) values
      ('a0000000-0000-0000-0000-000000000001', null, 'past_paper', 'Q9', 't', 'explain');
    raise exception 'FAIL: past_paper question without a paper';
  exception when check_violation then null; end;
  begin
    insert into past_questions (course_id, paper_id, number, text, type) values
      ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Q8', 't', 'mcq');
    raise exception 'FAIL: mcq without options';
  exception when check_violation then null; end;
  begin
    insert into past_papers (course_id, session, type, source_file, file_hash) values
      ('a0000000-0000-0000-0000-000000000001', '2025-2026', 'exam', 'x/y.pdf', 'h');
    raise exception 'FAIL: session not in 2025/2026 form';
  exception when check_violation then null; end;
  begin
    insert into practice_attempts (user_id, question_id, answer, revealed_only) values
      ('00000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-000000000001', null, false);
    raise exception 'FAIL: attempt with no answer that is not a reveal';
  exception when check_violation then null; end;
  begin
    insert into practice_attempts (user_id, question_id, answer, score, max_score) values
      ('00000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-000000000001', 'x', 11, 10);
    raise exception 'FAIL: score above max';
  exception when check_violation then null; end;
  raise notice 'PASS integrity';
end $$;

insert into practice_attempts (user_id, question_id, answer, score, max_score) values
  ('00000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-000000000001', 'carol answer', 6, 10),
  ('00000000-0000-0000-0000-0000000000d1', 'a3000000-0000-0000-0000-000000000001', 'dan answer', 4, 10);

-- Deleting a paper takes its questions (and sub-questions) with it: checked at the end, as service role.

-- ── Signed out: nothing ────────────────────────────────────
set local role anon;
do $$ begin
  begin
    perform 1 from past_papers;
    raise exception 'FAIL: anon can read past_papers';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from past_questions;
    raise exception 'FAIL: anon can read past_questions';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS signed out sees nothing';
end $$;
reset role;

-- ── Signed in as carol ─────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
do $$
declare n int; ids text;
begin
  select count(*) into n from past_papers where course_id = 'a0000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FAIL: expected only the reviewed paper, saw %', n; end if;

  select string_agg(number, ',' order by sort_order) into ids from past_questions where course_id = 'a0000000-0000-0000-0000-000000000001';
  if ids <> 'Q1,P1,Q1a' then raise exception 'FAIL: visible questions wrong: %', ids; end if;

  begin
    perform model_answer from past_questions limit 1;
    raise exception 'FAIL: student can read model_answer';
  exception when insufficient_privilege then null; end;
  begin
    perform answer_key from past_questions limit 1;
    raise exception 'FAIL: student can read answer_key';
  exception when insufficient_privilege then null; end;
  begin
    perform marking_scheme from past_questions limit 1;
    raise exception 'FAIL: student can read marking_scheme';
  exception when insufficient_privilege then null; end;

  select count(*) into n from question_topics where question_id = 'a3000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FAIL: question topics not readable'; end if;

  select string_agg(answer, ',') into ids from practice_attempts;
  if ids is distinct from 'carol answer' then raise exception 'FAIL: attempts visible: %', ids; end if;

  begin
    insert into practice_attempts (user_id, question_id, answer, score, max_score) values
      ('00000000-0000-0000-0000-0000000000c1', 'a3000000-0000-0000-0000-000000000001', 'forged', 10, 10);
    raise exception 'FAIL: student wrote their own score';
  exception when insufficient_privilege then null; end;
  begin
    update past_questions set text = 'x' where id = 'a3000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: student updated a question';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS students: reviewed only, no answers, own attempts only, read-only';
end $$;
reset role;

-- ── Cascades and traces.kind ───────────────────────────────
do $$
declare n int;
begin
  delete from past_papers where id = 'a2000000-0000-0000-0000-000000000001';
  select count(*) into n from past_questions where id in ('a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000004');
  if n <> 0 then raise exception 'FAIL: deleting a paper left % questions', n; end if;
  select count(*) into n from practice_attempts where question_id = 'a3000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FAIL: attempts of a deleted question kept'; end if;

  insert into traces (user_message, model, kind) values ('answer', 'claude-haiku-5-5', 'marking');
  begin
    insert into traces (user_message, model, kind) values ('x', 'm', 'other');
    raise exception 'FAIL: unknown trace kind accepted';
  exception when check_violation then null; end;
  raise notice 'PASS cascades, traces.kind';
end $$;

rollback;
\echo 'Past questions: all checks passed (rolled back, nothing kept).'
