-- Admin dashboard proof: admin_overview() returns every section, and only the service role can
-- call it (rolled back; nothing kept).
\set ON_ERROR_STOP 1
\set QUIET 1
begin;

do $$
declare o jsonb; k text;
begin
  o := public.admin_overview(now() - interval '30 days', 50);
  foreach k in array array['totals','daily','reasons','thumbs_down','courses','partners','departments','helping','recent','slowest','costliest','error_codes','students'] loop
    if not o ? k then raise exception 'FAIL: admin_overview() has no %', k; end if;
  end loop;
  if jsonb_array_length(o->'daily') < 30 then raise exception 'FAIL: daily should have a row per day, got %', jsonb_array_length(o->'daily'); end if;
  if jsonb_array_length(o->'helping') <> 5 then raise exception 'FAIL: helping should have scores 1–5'; end if;
  perform public.admin_overview(null, 50); -- all time
  raise notice 'PASS admin_overview() returns all 13 sections (30 days and all time)';
end $$;

do $$
declare role_name text;
begin
  foreach role_name in array array['authenticated', 'anon'] loop
    begin
      execute format('set local role %I', role_name);
      perform public.admin_overview(null, 50);
      reset role;
      raise exception 'FAIL: % could call admin_overview()', role_name;
    exception when insufficient_privilege then
      reset role;
    end;
  end loop;
  raise notice 'PASS students and the public cannot call admin_overview()';
end $$;

rollback;
