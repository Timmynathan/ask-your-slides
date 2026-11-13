-- Past questions, answer design v2 (PRD F10, Nov 2026): where each model answer comes from.
--   slides  : written from this course's slides (retrieved topic first, then the whole course), cited [[s:…]]
--   partial : the slides cover part of it; the rest is general knowledge in <general> blocks
--   general : nothing relevant was found; a general answer, shown with "Not from your slides. Either
--             this topic hasn't been uploaded yet, or it isn't in this year's slides."
-- The analysis step sets relevance so that it decides this exactly (no slide above the search cut-off →
-- not_covered; "covered" without a single slide citation → partial), so grounding is derived from it and
-- can never disagree. The app computes the same mapping (lib/past) and doesn't need this column to run.
-- general and partial answers are re-checked when the course gets new slides
-- (npm run ingest:past -- --analyse --recheck).
alter table public.past_questions add column grounding text generated always as (
  case relevance when 'covered' then 'slides' when 'partial' then 'partial' when 'not_covered' then 'general' end
) stored;
grant select (grounding) on public.past_questions to authenticated;
