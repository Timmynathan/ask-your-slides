-- Study partner chosen at onboarding (Tobi, Ada or Dr. Musa). Null = not chosen yet: the app
-- asks once. Students may change it themselves; it only changes the assistant's voice, never the
-- grounding rules.
alter table public.profiles
  add column study_partner text check (study_partner in ('tobi', 'ada', 'musa'));

grant update (study_partner) on public.profiles to authenticated;
