-- Fourth study partner: Zara, a blend of the other three.
alter table public.profiles drop constraint if exists profiles_study_partner_check;
alter table public.profiles
  add constraint profiles_study_partner_check check (study_partner in ('tobi', 'ada', 'musa', 'zara'));
