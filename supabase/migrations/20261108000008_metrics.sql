-- Phase 6 (PRD F9): pilot numbers as SQL views. No admin UI in the MVP: read them in the Supabase
-- SQL editor (or psql), e.g.  select * from metrics.daily order by day desc;
--
-- They live in their own schema, which the Data API doesn't expose and the student roles can't
-- use, so only the dashboard/service role can read them. Days are WAT (Africa/Lagos) calendar days,
-- the same days the daily cap uses.

create schema if not exists metrics;
revoke all on schema metrics from public, anon, authenticated;

-- One row per day: who studied, how much they asked, what it cost, how fast it was, how it landed.
create view metrics.daily as
with turns as (
  select (created_at at time zone 'Africa/Lagos')::date as day,
         count(*)                                         as turns,
         count(*) filter (where jsonb_array_length(errors) > 0) as turns_with_errors,
         round(sum(cost_usd), 4)                          as cost_usd,
         round(avg(ttft_ms))                              as avg_ttft_ms,
         round(avg(latency_ms))                           as avg_latency_ms
  from public.traces group by 1
), msgs as (
  select (created_at at time zone 'Africa/Lagos')::date as day,
         count(distinct user_id)                          as active_students,
         count(*) filter (where role = 'user')            as questions,
         count(distinct conversation_id)                  as chats_used
  from public.messages group by 1
), fb as (
  select (created_at at time zone 'Africa/Lagos')::date as day,
         count(*) filter (where rating = 1)               as thumbs_up,
         count(*) filter (where rating = -1)              as thumbs_down
  from public.feedback group by 1
)
select coalesce(m.day, t.day, f.day)                      as day,
       coalesce(m.active_students, 0)                     as active_students,
       coalesce(m.questions, 0)                           as questions,
       coalesce(m.chats_used, 0)                          as chats_used,
       coalesce(t.turns, 0)                               as answers,
       coalesce(t.turns_with_errors, 0)                   as answers_with_errors,
       coalesce(t.cost_usd, 0)                            as cost_usd,
       t.avg_ttft_ms,
       t.avg_latency_ms,
       coalesce(f.thumbs_up, 0)                           as thumbs_up,
       coalesce(f.thumbs_down, 0)                         as thumbs_down,
       case when coalesce(f.thumbs_up, 0) + coalesce(f.thumbs_down, 0) > 0
            then round(100.0 * f.thumbs_up / (f.thumbs_up + f.thumbs_down), 1) end as thumbs_up_pct
from msgs m
full join turns t on t.day = m.day
full join fb f on f.day = coalesce(m.day, t.day);

-- The whole pilot in one row: the PRD §4 success metrics and the ≤ $100 budget.
create view metrics.pilot as
select
  (select count(*) from public.profiles)                                         as students_signed_up,
  (select count(*) from public.profiles where onboarded)                         as students_onboarded,
  (select count(distinct user_id) from public.messages where role = 'user')      as students_who_asked,
  (select count(*) from public.messages where role = 'user')                     as questions,
  (select round(coalesce(sum(cost_usd), 0), 2) from public.traces)               as cost_usd,
  (select round(coalesce(sum(cost_usd), 0) / nullif(count(*), 0), 5) from public.traces) as cost_per_answer_usd,
  (select round(100.0 * count(*) filter (where rating = 1) / nullif(count(*), 0), 1) from public.feedback) as thumbs_up_pct,
  (select count(*) from public.feedback)                                         as feedback_given,
  (select round(avg(score), 2) from public.pulse_responses)                      as helping_avg_1_to_5,
  (select count(*) from public.pulse_responses)                                  as helping_responses,
  -- Students who came back on at least 3 different days (WAT).
  (select count(*) from (
     select user_id from public.messages where role = 'user'
     group by user_id having count(distinct (created_at at time zone 'Africa/Lagos')::date) >= 3) r) as students_3plus_days;

-- Why answers got a thumbs down (F7), newest first, with the question and answer to read.
create view metrics.thumbs_down as
select f.created_at, f.reason, f.comment,
       c.code as course, t.user_message as question, left(m.content, 400) as answer_start, m.id as message_id
from public.feedback f
join public.messages m on m.id = f.message_id
left join public.traces t on t.message_id = m.id
left join public.conversations cv on cv.id = m.conversation_id
left join public.courses c on c.id = cv.course_id
where f.rating = -1;

-- "Is this helping you study?" spread (1–5).
create view metrics.helping as
select score, count(*) as students from public.pulse_responses group by score;

-- Which study partners students pick (PRD F1b): checks the four stay balanced.
create view metrics.partners as
select coalesce(study_partner, '(not chosen)') as partner, count(*) as students,
       round(100.0 * count(*) / nullif(sum(count(*)) over (), 0), 1) as pct
from public.profiles where onboarded group by 1;

-- Per course: where the questions go, and how well it lands there.
create view metrics.courses as
select c.code, c.title,
       count(distinct cv.user_id)                                  as students,
       count(m.id) filter (where m.role = 'user')                  as questions,
       count(f.*) filter (where f.rating = 1)                      as thumbs_up,
       count(f.*) filter (where f.rating = -1)                     as thumbs_down
from public.courses c
left join public.conversations cv on cv.course_id = c.id
left join public.messages m on m.conversation_id = cv.id
left join public.feedback f on f.message_id = m.id
group by c.id, c.code, c.title, c.sort_order
order by c.sort_order;

revoke all on all tables in schema metrics from public, anon, authenticated;
