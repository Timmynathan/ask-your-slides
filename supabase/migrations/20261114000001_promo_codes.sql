-- Promo codes for course reps (PRD F12, owner 14 Nov 2026): the owner generates single-use codes in
-- /admin/promo and sends them to course reps. A rep types one in (onboarding or the Plans page) and
-- gets Finals for the code's days (7 by default), then goes back to Free on their own.
--   - one code = one student, once (the row lock queues a double submit; the second sees it used)
--   - one promo code per student, ever (redeemed_by is unique)
--   - a student already on Finals keeps the code unused (nothing to try)
-- Service-role only, like the rest of the plans tables.

create table public.promo_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{4,23}$'),
  days            int  not null default 7 check (days between 1 and 60),
  -- Who it's for, e.g. "CSC course rep, Tolu" (shown in /admin/promo only).
  note            text,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  redeemed_by     uuid unique references public.profiles(id) on delete set null,
  redeemed_at     timestamptz,
  redeemed_email  text,
  entitlement_id  uuid references public.entitlements(id) on delete set null
);
create index promo_codes_created_idx on public.promo_codes (created_at desc);

alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;
grant select, insert, update, delete on public.promo_codes to service_role;

alter table public.entitlements drop constraint entitlements_source_check;
alter table public.entitlements add constraint entitlements_source_check check (source in ('manual', 'comp', 'promo'));

-- outcome: redeemed | not_found | used | already_yours | one_per_student | already_finals
create or replace function public.redeem_promo_code(p_user uuid, p_email text, p_code text, p_now timestamptz)
returns table (outcome text, ends_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v public.promo_codes%rowtype;
  v_ends timestamptz;
  v_ent uuid;
begin
  select * into v from public.promo_codes c where c.code = upper(btrim(p_code)) for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if v.redeemed_at is not null then
    return query select (case when v.redeemed_by = p_user then 'already_yours' else 'used' end)::text, null::timestamptz;
    return;
  end if;
  if exists (select 1 from public.promo_codes c where c.redeemed_by = p_user) then
    return query select 'one_per_student'::text, null::timestamptz;
    return;
  end if;
  if exists (select 1 from public.entitlements e where e.user_id = p_user and e.starts_at <= p_now and e.ends_at > p_now) then
    return query select 'already_finals'::text, null::timestamptz;
    return;
  end if;
  v_ends := p_now + make_interval(days => v.days);
  insert into public.entitlements (user_id, plan, starts_at, ends_at, source, note)
  values (p_user, 'finals', p_now, v_ends, 'promo', 'promo code ' || v.code)
  returning id into v_ent;
  update public.promo_codes
  set redeemed_by = p_user, redeemed_at = p_now, redeemed_email = lower(p_email), entitlement_id = v_ent
  where id = v.id;
  return query select 'redeemed'::text, v_ends;
end $$;

revoke execute on function public.redeem_promo_code(uuid, text, text, timestamptz) from anon, authenticated, public;
grant execute on function public.redeem_promo_code(uuid, text, text, timestamptz) to service_role;
