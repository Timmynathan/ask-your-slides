-- Phase 6 proof: the pilot views work, and students / the public can't read them (rolled back).
\set ON_ERROR_STOP 1
\set QUIET 1
begin;

do $$
declare n int; r record;
begin
  perform * from metrics.daily limit 1;
  perform * from metrics.thumbs_down limit 1;
  perform * from metrics.helping;
  perform * from metrics.partners;
  perform * from metrics.courses;
  select * into r from metrics.pilot;
  if r.students_signed_up is null then raise exception 'FAIL: metrics.pilot returned no row'; end if;
  select count(*) into n from metrics.courses;
  if n <> (select count(*) from public.courses) then raise exception 'FAIL: metrics.courses has % rows', n; end if;
  raise notice 'PASS the six metrics views run (pilot: % students, $% spent)', r.students_signed_up, r.cost_usd;
end $$;

-- Students (and the public) can't read the numbers, even with a valid session.
do $$
declare role_name text;
begin
  foreach role_name in array array['authenticated', 'anon'] loop
    begin
      execute format('set local role %I', role_name);
      perform * from metrics.pilot;
      reset role;
      raise exception 'FAIL: % could read metrics.pilot', role_name;
    exception when insufficient_privilege then
      reset role;
    end;
  end loop;
  raise notice 'PASS metrics views are closed to students and the public';
end $$;

rollback;
