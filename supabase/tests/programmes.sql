-- Programme isolation proof (PRD F11): a student sees only their programme + level's courses and
-- everything under them, in the database. Run: npm run test:db (rolled back at the end).
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
begin;

-- ── Fixtures: one CS course, one ISMS course (fake codes), three students ──
insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'cs.student@pau.edu.ng',   'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000e2', 'isms.student@pau.edu.ng', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-0000000000e3', 'new.student@pau.edu.ng',  'authenticated', 'authenticated', now(), now());

insert into courses (id, institution, school, programme, level, semester, session, code, title, department, sort_order, elective) values
  ('b0000000-0000-0000-0000-000000000001', 'pau', 'sst', 'computer-science', 400, 1, '2026-2027', 'TCS901', 'CS Fixture', 'Computer Science', 991, false),
  ('b0000000-0000-0000-0000-000000000002', 'pau', 'smc', 'information-science-and-media-studies', 400, 1, '2026-2027', 'TIS901', 'ISMS Fixture',
   'Information Science and Media Studies', 992, true);
insert into course_sessions (id, course_id, session) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2026-2027'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '2026-2027');
insert into topics (id, course_id, topic_order, title) values
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, 'CS topic'),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 1, 'ISMS topic');
insert into materials (id, course_id, course_session_id, topic_id, kind, material_order, title, source_file, content_hash, page_count, source) values
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'slides', 1, 'CS slides', 'cs.pdf', 'h', 1, 'lecturer'),
  ('b3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'notes', 1, 'ISMS notes', 'isms.docx', 'h', 1, 'lecturer');
insert into slides (id, material_id, course_id, slide_number, slide_key, chunk_text, label) values
  ('b4000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, 'TCS901-01-1', 'cs', null),
  ('b4000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 1, 'TIS901-01-1', 'isms', 'Law › Privacy');
insert into past_papers (id, course_id, session, type, source_file, file_hash, status) values
  ('b5000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '2025/2026', 'exam', 'p.pdf', 'h', 'ok');
insert into past_questions (course_id, paper_id, number, text, marks, type) values
  ('b0000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000002', 'Q1', 'ISMS question', 10, 'explain');

update profiles set programme = 'computer-science', level = 400 where id = '00000000-0000-0000-0000-0000000000e1';
update profiles set programme = 'information-science-and-media-studies', level = 400 where id = '00000000-0000-0000-0000-0000000000e2';
-- e3 has not chosen yet.

-- A chat the ISMS student started, then they "switch" to CS below.
insert into conversations (id, user_id, course_id, title) values
  ('b6000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2', 'b0000000-0000-0000-0000-000000000002', 'Privacy');

do $$ begin
  begin
    update profiles set programme = 'no-such-programme', level = 400 where id = '00000000-0000-0000-0000-0000000000e3';
    raise exception 'FAIL: a programme that is not in the catalog was accepted';
  exception when foreign_key_violation then null; end;
  begin
    update profiles set programme = 'computer-science', level = null where id = '00000000-0000-0000-0000-0000000000e3';
    raise exception 'FAIL: a programme without a level was accepted';
  exception when check_violation then null; end;
  raise notice 'PASS profile programme must be in the catalog, with a level';
end $$;

-- ── CS student ─────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
do $$
declare codes text; n int;
begin
  select string_agg(code, ',' order by code) into codes from courses where code in ('TCS901', 'TIS901');
  if codes is distinct from 'TCS901' then raise exception 'FAIL: CS student sees courses %', codes; end if;
  select count(*) into n from slides where slide_key = 'TIS901-01-1';
  if n <> 0 then raise exception 'FAIL: CS student can read an ISMS slide'; end if;
  select count(*) into n from materials where course_id = 'b0000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: CS student can read ISMS materials'; end if;
  select count(*) into n from topics where course_id = 'b0000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: CS student can read ISMS topics'; end if;
  select count(*) into n from course_sessions where course_id = 'b0000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: CS student can read ISMS sessions'; end if;
  select count(*) into n from past_questions where course_id = 'b0000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: CS student can read ISMS past questions'; end if;
  begin
    insert into conversations (user_id, course_id, title) values ('00000000-0000-0000-0000-0000000000e1', 'b0000000-0000-0000-0000-000000000002', 'x');
    raise exception 'FAIL: CS student started a chat in an ISMS course';
  exception when insufficient_privilege then null; end;
  insert into conversations (user_id, course_id, title) values ('00000000-0000-0000-0000-0000000000e1', 'b0000000-0000-0000-0000-000000000001', 'ok');
  select count(*) into n from programme_choices() where programme in ('computer-science', 'information-science-and-media-studies');
  if n <> 2 then raise exception 'FAIL: onboarding should offer both programmes, got %', n; end if;
  raise notice 'PASS a CS student sees CS courses only (courses, sessions, topics, materials, slides, past questions, chats)';
end $$;
reset role;

-- ── ISMS student ───────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
do $$
declare codes text; n int; elective bool;
begin
  select string_agg(code, ',' order by code), bool_or(courses.elective) into codes, elective from courses where code in ('TCS901', 'TIS901');
  if codes is distinct from 'TIS901' or not elective then raise exception 'FAIL: ISMS student sees % (elective %)', codes, elective; end if;
  select count(*) into n from slides where slide_key = 'TCS901-01-1';
  if n <> 0 then raise exception 'FAIL: ISMS student can read a CS slide'; end if;
  select count(*) into n from past_questions;
  if n <> 1 then raise exception 'FAIL: ISMS student should see exactly the ISMS fixture question, saw %', n; end if;
  select count(*) into n from conversations;
  if n <> 1 then raise exception 'FAIL: ISMS student should see their chat'; end if;
  -- Switching programme (account menu): the old course and its chat disappear.
  update profiles set programme = 'computer-science', level = 400 where id = '00000000-0000-0000-0000-0000000000e2';
  select count(*) into n from conversations;
  if n <> 0 then raise exception 'FAIL: after switching to CS, the ISMS chat is still visible'; end if;
  select string_agg(code, ',') into codes from courses where code in ('TCS901', 'TIS901');
  if codes is distinct from 'TCS901' then raise exception 'FAIL: after switching, sees %', codes; end if;
  raise notice 'PASS an ISMS student sees ISMS courses only; switching programme switches everything';
end $$;
reset role;

-- ── Not chosen yet ─────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from courses;
  if n <> 0 then raise exception 'FAIL: a student without a programme sees % courses', n; end if;
  select count(*) into n from programme_choices();
  if n < 2 then raise exception 'FAIL: a new student must still see the choices'; end if;
  raise notice 'PASS a student who has not chosen sees no courses, but can see the choices';
end $$;
reset role;

-- Signed out: nothing, and the helper functions are closed.
set local role anon;
do $$ begin
  begin
    perform 1 from programmes;
    raise exception 'FAIL: anon can read programmes';
  exception when insufficient_privilege then null; end;
  begin
    perform public.my_course_ids();
    raise exception 'FAIL: anon can call my_course_ids';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS signed out: no programmes, no helpers';
end $$;
reset role;

rollback;
\echo 'Programmes: all checks passed (rolled back, nothing kept).'
