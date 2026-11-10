-- Recovery email for password resets (owner, 10 Nov 2026).
--
-- PAU's Microsoft 365 accepts our code emails ("250 Queued mail for delivery") and then hides them
-- from the student, so "Forgot password" can't rely on the PAU inbox. A student can add a personal
-- address (Gmail…), proved with a code, and reset codes go there instead.
--
--   profiles.recovery_email (+ verified_at)  set only by the server after the code is checked; the
--                                            student can read it (own row) but not write it.
--   auth_codes                               one-time codes: hashed, salted, 10-minute expiry, 5 tries,
--                                            single use. Service role only (RLS on, no policies).

alter table public.profiles
  add column recovery_email text check (recovery_email is null or (recovery_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(recovery_email) <= 254)),
  add column recovery_email_verified_at timestamptz,
  add constraint profiles_recovery_verified check ((recovery_email is null) = (recovery_email_verified_at is null));
-- Students can't set it themselves (column grants list only what they may change).

create table public.auth_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  purpose     text not null check (purpose in ('verify_recovery', 'reset')),
  email       text not null,                    -- where the code was sent
  code_hash   text not null,                    -- sha256(salt || code), hex
  salt        text not null,
  attempts    int  not null default 0,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index auth_codes_user_idx on public.auth_codes (user_id, purpose, created_at desc);

alter table public.auth_codes enable row level security;
revoke all on public.auth_codes from anon, authenticated;
