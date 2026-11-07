-- Sign-up is limited to @pau.edu.ng (PRD F1).
--
-- The app's /api/auth/otp route rejects other domains before asking Supabase for a code. But the
-- publishable key is public, so anyone could call Supabase Auth directly and skip the app. This
-- "before user created" hook makes Supabase itself refuse to create any non-PAU account, so no
-- code is ever sent to it.
--
-- Enable once per project: Supabase Dashboard → Authentication → Hooks → "Before User Created"
-- → Postgres → public.hook_before_user_created.

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if public.is_pau_email(v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Use your PAU email.')
  );
end $$;

-- Exactly one '@', a plain local part, and the domain pau.edu.ng — no subdomains, no lookalikes.
create or replace function public.is_pau_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(trim(p_email)) ~ '^[a-z0-9._%+''-]+@pau\.edu\.ng$', false);
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
grant execute on function public.is_pau_email(text) to supabase_auth_admin;
