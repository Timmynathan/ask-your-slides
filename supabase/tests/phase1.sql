-- Phase 1 proof: schema, topics/materials, RLS, match_slides(), daily cap.
-- Run: npm run test:db   (psql against DATABASE_URL; everything is rolled back at the end)
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
begin;

-- ── Fixtures ────────────────────────────────────────────────
-- Fixture courses CSC401/CSC403 don't exist in the real data; counts below are scoped to them so
-- the test also passes on a database that holds real courses.
-- A unit vector along dimension n (plus an optional small nudge along m), so rankings are exact.
create function pg_temp.vec(n int, m int default null, w float default 0)
returns extensions.vector language sql immutable as $$
  select array_agg(case when i = n then 1.0 when i = m then w else 0.0 end order by i)::extensions.vector
  from generate_series(1, 1024) i
$$;

insert into auth.users (id, email, aud, role, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@pau.edu.ng', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-0000-0000-00000000000b', 'bob@pau.edu.ng',   'authenticated', 'authenticated', now(), now());

insert into courses (id, code, title, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'CSC401', 'Compiler Construction', 1),
  ('10000000-0000-0000-0000-000000000002', 'CSC403', 'Artificial Intelligence', 2);

insert into topics (id, course_id, topic_order, title) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'Introduction'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 2, 'Parsing'),
  ('60000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 1, 'Search');

insert into materials (id, course_id, topic_id, kind, material_order, title, source_file, content_hash, page_count) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'slides',  1, 'Introduction',      '01-intro.pptx',   'h1', 2),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'slides',  4, 'Parsing',           '04-parsing.pdf',  'h4', 2),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'reading', 5, 'Parsing reading',   '05-reading.pdf',  'h5', 1),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', null,                                   'outline', 6, 'Course outline',    '06-outline.pdf',  'h6', 1),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000009', 'slides',  1, 'Search',            '01-search.pdf',   'h9', 1);

insert into slides (material_id, course_id, slide_number, slide_key, title, chunk_text, embedding) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'CSC401-01-1',
   'Introduction to compilers', 'Title: Introduction to compilers. A compiler translates source code.', pg_temp.vec(1)),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2, 'CSC401-01-2',
   'Phases of a compiler', 'Title: Phases of a compiler. Lexer, syntax analysis, code generation.', pg_temp.vec(1, 2, 0.1)),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 2, 'CSC401-04-2',
   'Conflicts', 'Title: Conflicts. Two productions in one cell means the grammar is not LL(1).', pg_temp.vec(4)),
  -- Course outline mentions the same terms; outlines are left out of normal search.
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 1, 'CSC401-06-1',
   'Course outline', 'Title: Course outline. Week 4: FIRST and FOLLOW sets, LL(1) parsing table.', pg_temp.vec(3)),
  -- Other course: closest vector AND the same exact terms. Must never leak into CSC401 results.
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 1, 'CSC403-01-1',
   'FIRST and FOLLOW sets', 'Title: FIRST and FOLLOW sets LL(1) parsing table.', pg_temp.vec(1));
-- A slide and a reading with IDENTICAL evidence. The reading gets the lower id, so without the
-- reading weight it would win the tie; with it, the slide must come first.
insert into slides (id, material_id, course_id, slide_number, slide_key, title, chunk_text, embedding) values
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 1, 'CSC401-04-1',
   'LL(1) parsing table', 'Title: LL(1) parsing table. Built from FIRST and FOLLOW sets.', pg_temp.vec(3)),
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 1, 'CSC401-05-1',
   'LL(1) parsing table', 'Title: LL(1) parsing table. Built from FIRST and FOLLOW sets.', pg_temp.vec(3));

-- ── Profiles ────────────────────────────────────────────────
do $$ begin
  if (select count(*) from profiles where email in ('alice@pau.edu.ng', 'bob@pau.edu.ng')) <> 2 then
    raise exception 'FAIL: new auth users did not get profile rows';
  end if;
  raise notice 'PASS profiles created by trigger';
end $$;

-- ── match_slides ────────────────────────────────────────────
do $$
declare
  csc401 uuid := '10000000-0000-0000-0000-000000000001';
  intro  uuid := '60000000-0000-0000-0000-000000000001';
  parsing uuid := '60000000-0000-0000-0000-000000000002';
  top text; n int; r record; sim float;
begin
  -- Vector points at "Introduction"; text names exact terms on the LL(1) slide. Hybrid must put the
  -- exact-term slide first (it ranks in both arms; Introduction ranks in one).
  select slide_key into top from match_slides(csc401, pg_temp.vec(1), 'FIRST and FOLLOW sets', 8) limit 1;
  if top <> 'CSC401-04-1' then raise exception 'FAIL: exact-term slide not first, got %', top; end if;
  raise notice 'PASS keyword arm lifts exact-term slide to #1';

  -- Pure semantic: no keyword hits → nearest vector first, nudged neighbour second.
  select string_agg(slide_key, ',' order by score desc) into top
  from (select * from match_slides(csc401, pg_temp.vec(1), 'zzzz', 2)) t;
  if top <> 'CSC401-01-1,CSC401-01-2' then raise exception 'FAIL: semantic order/k wrong: %', top; end if;
  raise notice 'PASS semantic ranking and k';

  -- Course isolation: CSC403 slide is the closest vector and has every term, but is a different course.
  select count(*) into n from match_slides(csc401, pg_temp.vec(1), 'FIRST FOLLOW LL(1) parsing table', 20)
  where slide_key like 'CSC403%';
  if n <> 0 then raise exception 'FAIL: other-course slide returned'; end if;
  raise notice 'PASS results stay in the requested course';

  -- Topic filter: an Introduction-topic search never returns Parsing slides, even for Parsing terms.
  select count(*) into n from match_slides(csc401, pg_temp.vec(3), 'FIRST and FOLLOW sets', 20, intro)
  where topic_id is distinct from intro;
  if n <> 0 then raise exception 'FAIL: topic search returned % slides from other topics', n; end if;
  raise notice 'PASS topic filter';

  -- Fallback signal: best similarity is high in the right topic, low in the wrong one.
  select max(similarity) into sim from match_slides(csc401, pg_temp.vec(3), 'zzzz', 8, parsing);
  if sim < 0.99 then raise exception 'FAIL: in-topic similarity too low: %', sim; end if;
  select max(similarity) into sim from match_slides(csc401, pg_temp.vec(3), 'zzzz', 8, intro);
  if sim > 0.1 then raise exception 'FAIL: off-topic similarity too high: %', sim; end if;
  raise notice 'PASS similarity tells a good topic match from a poor one';

  -- Kinds: outlines are not searched by default, but can be asked for.
  select count(*) into n from match_slides(csc401, pg_temp.vec(3), 'FIRST FOLLOW', 20) where material_kind = 'outline';
  if n <> 0 then raise exception 'FAIL: outline returned by default search'; end if;
  select count(*) into n from match_slides(csc401, pg_temp.vec(3), 'FIRST FOLLOW', 20, null, array['outline']);
  if n <> 1 then raise exception 'FAIL: outline not returned when asked for'; end if;
  raise notice 'PASS kind filter (outline excluded by default)';

  -- Readings support; slides lead. Identical evidence → slide first.
  select string_agg(slide_key, ',' order by score desc) into top
  from match_slides(csc401, pg_temp.vec(3), 'FIRST and FOLLOW sets', 2, parsing);
  if top <> 'CSC401-04-1,CSC401-05-1' then raise exception 'FAIL: reading outranked slide: %', top; end if;
  raise notice 'PASS slides rank above readings on equal evidence';

  -- Neighbour titles.
  select * into r from match_slides(csc401, pg_temp.vec(4), 'zzzz', 1);
  if r.prev_title is distinct from 'LL(1) parsing table' or r.next_title is not null then
    raise exception 'FAIL: neighbour titles wrong: prev=% next=%', r.prev_title, r.next_title;
  end if;
  if r.topic_title is distinct from 'Parsing' or r.material_kind <> 'slides' then
    raise exception 'FAIL: topic/kind not returned: % %', r.topic_title, r.material_kind;
  end if;
  raise notice 'PASS neighbour titles, topic and kind returned';

  -- Stop-words-only query text must not error.
  perform * from match_slides(csc401, pg_temp.vec(1), 'the and of', 8);
  raise notice 'PASS stop-word-only query';
end $$;

-- ── Topic must belong to the conversation's / material's course ──
do $$ begin
  begin
    insert into conversations (user_id, course_id, topic_id) values
      ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: conversation accepted a topic from another course';
  exception when foreign_key_violation then null; end;
  begin
    insert into materials (course_id, topic_id, kind, material_order, title, source_file, content_hash) values
      ('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'slides', 7, 'x', 'x.pdf', 'x');
    raise exception 'FAIL: material accepted a topic from another course';
  exception when foreign_key_violation then null; end;
  begin
    insert into materials (course_id, kind, material_order, title, source_file, content_hash) values
      ('10000000-0000-0000-0000-000000000001', 'skipped', 8, 'x', 'y.pdf', 'x');
    raise exception 'FAIL: kind skipped was stored';
  exception when check_violation then null; end;
  raise notice 'PASS topics stay inside their course; skipped is never stored';
end $$;

-- Data the RLS tests need, written as the server (service role) would.
insert into conversations (id, user_id, course_id, topic_id) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002');
insert into messages (id, conversation_id, user_id, role, content) values
  ('40000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'assistant', 'hi');
insert into traces (user_id, user_message, model) values ('00000000-0000-0000-0000-00000000000a', 'q', 'test');

-- ── RLS as Bob ──────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$ begin
  if (select count(*) from slides where course_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')) <> 7 then raise exception 'FAIL: signed-in user cannot read slides'; end if;
  if (select count(*) from topics where course_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')) <> 3 or (select count(*) from materials where course_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')) <> 5 then raise exception 'FAIL: signed-in user cannot read topics/materials'; end if;
  if (select count(*) from match_slides('10000000-0000-0000-0000-000000000001', pg_temp.vec(1), 'parsing', 8)) = 0 then
    raise exception 'FAIL: signed-in user cannot call match_slides';
  end if;
  raise notice 'PASS signed-in user reads course content';

  if (select count(*) from conversations) <> 0 then raise exception 'FAIL: Bob sees Alice''s conversation'; end if;
  if (select count(*) from messages) <> 0 then raise exception 'FAIL: Bob sees Alice''s messages'; end if;
  if (select count(*) from profiles) <> 1 then raise exception 'FAIL: Bob sees other profiles'; end if;
  raise notice 'PASS Bob cannot read Alice''s rows';

  begin
    insert into conversations (user_id, course_id) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: Bob created a conversation as Alice';
  exception when insufficient_privilege then null; end;

  begin
    insert into feedback (message_id, rating) values ('40000000-0000-0000-0000-00000000000a', 1);
    raise exception 'FAIL: Bob rated Alice''s message';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS Bob cannot write as Alice';

  begin insert into messages (conversation_id, user_id, role, content)
        values ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'assistant', 'fake');
        raise exception 'FAIL: user inserted a message directly';
  exception when insufficient_privilege then null; end;
  begin insert into slides (material_id, course_id, slide_number, slide_key, chunk_text)
        values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 9, 'CSC401-01-9', 'x');
        raise exception 'FAIL: user wrote to slides';
  exception when insufficient_privilege then null; end;
  begin perform * from traces;      raise exception 'FAIL: user read traces';
  exception when insufficient_privilege then null; end;
  begin perform * from usage_daily; raise exception 'FAIL: user read usage_daily';
  exception when insufficient_privilege then null; end;
  begin perform public.consume_message('00000000-0000-0000-0000-00000000000b', 999);
        raise exception 'FAIL: user called consume_message';
  exception when insufficient_privilege then null; end;
  begin update profiles set email = 'x@gmail.com'; raise exception 'FAIL: user changed own email';
  exception when insufficient_privilege then null; end;
  update profiles set display_name = 'Bob';
  raise notice 'PASS server-only tables and columns are closed to students';
end $$;

-- ── RLS as Alice ────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ begin
  if (select count(*) from conversations) <> 1 or (select count(*) from messages) <> 1 then
    raise exception 'FAIL: Alice cannot read her own rows';
  end if;
  insert into conversations (course_id) values ('10000000-0000-0000-0000-000000000002');   -- user_id defaults to auth.uid()
  insert into feedback (message_id, rating, reason) values ('40000000-0000-0000-0000-00000000000a', -1, 'too_long');
  insert into pulse_responses (score) values (4);
  raise notice 'PASS Alice reads and writes her own rows';
end $$;

-- ── anon ────────────────────────────────────────────────────
reset role;
set local role anon;
do $$ begin
  begin perform * from slides; raise exception 'FAIL: anon read slides';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS anon reads nothing';
end $$;

-- ── Daily cap ───────────────────────────────────────────────
reset role;
do $$
declare r record; i int;
begin
  for i in 1..3 loop
    select * into r from consume_message('00000000-0000-0000-0000-00000000000a', 3);
    if not r.allowed or r.used <> i then raise exception 'FAIL: message % not allowed (used=%)', i, r.used; end if;
  end loop;
  select * into r from consume_message('00000000-0000-0000-0000-00000000000a', 3);
  if r.allowed or r.used <> 3 then raise exception 'FAIL: cap not enforced (allowed=% used=%)', r.allowed, r.used; end if;
  perform refund_message('00000000-0000-0000-0000-00000000000a');
  select * into r from consume_message('00000000-0000-0000-0000-00000000000a', 3);
  if not r.allowed then raise exception 'FAIL: refund did not free a message'; end if;
  raise notice 'PASS daily cap enforces, refunds, and does not over-count';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$ begin
  if my_usage_today() <> 3 then raise exception 'FAIL: my_usage_today = %', my_usage_today(); end if;
  raise notice 'PASS my_usage_today';
end $$;

rollback;
\echo 'Phase 1: all checks passed (rolled back, nothing kept).'
