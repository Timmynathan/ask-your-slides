-- Which devices students use (owner, 23 Nov 2026): one row per student per kind of device, operating
-- system and browser, refreshed at most once a day when they open the app (components/nav/device-beacon.tsx
-- → /api/device). Only these three labels are kept: no raw browser string, no IP address.
-- Written and read with the service role only (the admin dashboard).
create table public.user_devices (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('phone', 'tablet', 'laptop')),
  os         text not null,
  browser    text not null,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, kind, os, browser)
);
create index user_devices_last_seen_idx on public.user_devices (last_seen desc);

alter table public.user_devices enable row level security;
