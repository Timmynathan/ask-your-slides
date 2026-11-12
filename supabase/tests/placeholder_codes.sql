-- Placeholder course codes (migration 20261112000001): IOH-ETHICS-style codes and their slide keys
-- are accepted, malformed ones still refused; a 500-level programme is offered at 500 level.
-- Run: npm run test:db (rolled back at the end).
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
begin;

insert into programmes (institution, id, name, department, school, sort_order) values
  ('pau', 'test-engineering', 'BEng Test Engineering', 'Test Engineering', 'sst', 990);
insert into courses (id, institution, school, programme, level, semester, session, code, title, department, sort_order, code_confirmed) values
  ('c0000000-0000-0000-0000-000000000001', 'pau', 'sst', 'test-engineering', 500, 1, '2026-2027', 'TST-ETHICS-II', 'Placeholder Fixture', 'Test Engineering', 993, false),
  ('c0000000-0000-0000-0000-000000000002', 'pau', 'sst', 'test-engineering', 500, 1, '2026-2027', 'TEG501', 'Real Code Fixture', 'Test Engineering', 994, true);
insert into course_sessions (id, course_id, session) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-2027');
insert into materials (id, course_id, course_session_id, kind, material_order, title, source_file, content_hash, page_count, source) values
  ('c3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'slides', 3, 'Slides', 'x.pdf', 'h', 1, 'lecturer');
insert into slides (material_id, course_id, slide_number, slide_key, chunk_text) values
  ('c3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 12, 'TST-ETHICS-II-03-12', 'chunk');

do $$
declare
  bad text;
begin
  -- The default is "confirmed": every existing course keeps showing its code.
  if (select code_confirmed from courses where id = 'c0000000-0000-0000-0000-000000000002') is not true then
    raise exception 'FAIL: code_confirmed should default to true';
  end if;
  foreach bad in array array['ETHICS', 'IOH-', 'IOH-1ST', 'ioh-ethics', 'CSC4200', 'IOH ETHICS'] loop
    begin
      insert into courses (institution, school, programme, level, semester, session, code, title, department, sort_order)
      values ('pau', 'sst', 'test-engineering', 500, 1, '2026-2027', bad, 'Bad', 'Test Engineering', 999);
      raise exception 'FAIL: course code % was accepted', bad;
    exception when check_violation then null;
    end;
  end loop;
  foreach bad in array array['TST-ETHICS-II-3-12', 'TST-ETHICS-II-03', 'TST-ETHICS-II-03-1234'] loop
    begin
      insert into slides (material_id, course_id, slide_number, slide_key, chunk_text)
      values ('c3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 99, bad, 'x');
      raise exception 'FAIL: slide key % was accepted', bad;
    exception when check_violation then null;
    end;
  end loop;
  if not exists (select 1 from programme_choices() where programme = 'test-engineering' and level = 500)
     or exists (select 1 from programme_choices() where programme = 'test-engineering' and level <> 500) then
    raise exception 'FAIL: programme_choices should offer test-engineering at 500 level only';
  end if;
  raise notice 'PASS placeholder codes: accepted, malformed codes and keys refused, 500 level offered';
end $$;

rollback;
