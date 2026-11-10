-- Recovery email dropped (owner, 10 Nov 2026), before it shipped: a student who forgets their
-- password now presses "Escalate to admin" on the sign-in page (a prefilled email to the owner),
-- and the owner sets a temporary password from /admin. Removes what 20261110000004 added.
drop table if exists public.auth_codes;
alter table public.profiles
  drop constraint if exists profiles_recovery_verified,
  drop column if exists recovery_email_verified_at,
  drop column if exists recovery_email;
