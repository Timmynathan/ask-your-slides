-- Phase 3 proof: the auth hook accepts only @pau.edu.ng (rolled back; nothing kept).
\set ON_ERROR_STOP 1
\set QUIET 1
begin;

do $$
declare
  ok   text[] := array['student@pau.edu.ng', 'Student.Name@PAU.EDU.NG', '  a.b-c+d@pau.edu.ng ', 'o''neil@pau.edu.ng'];
  bad  text[] := array['someone@gmail.com', 'x@cs.pau.edu.ng', 'x@pau.edu.ng.evil.com', 'x@notpau.edu.ng',
                       'a@pau.edu.ng@gmail.com', 'pau.edu.ng', '', 'x @pau.edu.ng'];
  e text; r jsonb;
begin
  foreach e in array ok loop
    r := public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', e)));
    if r <> '{}'::jsonb then raise exception 'FAIL: % was rejected: %', e, r; end if;
  end loop;
  raise notice 'PASS % PAU addresses accepted (case, spaces, dots, plus, apostrophe)', array_length(ok, 1);

  foreach e in array bad loop
    r := public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', e)));
    if r #>> '{error,http_code}' <> '403' or r #>> '{error,message}' <> 'Use your PAU email.' then
      raise exception 'FAIL: % was not rejected: %', e, r;
    end if;
  end loop;
  r := public.hook_before_user_created('{"user": {"phone": "+2348000000000"}}'::jsonb);
  if r ? 'error' is not true then raise exception 'FAIL: user without email accepted'; end if;
  raise notice 'PASS % lookalike / non-PAU addresses rejected with "Use your PAU email."', array_length(bad, 1) + 1;
end $$;

-- Only Supabase Auth may call the hook.
set local role authenticated;
do $$ begin
  begin
    perform public.hook_before_user_created('{}'::jsonb);
    raise exception 'FAIL: signed-in users can call the auth hook';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS hook is not callable by API roles';
end $$;

rollback;
\echo 'Phase 3 (DB): all checks passed.'
