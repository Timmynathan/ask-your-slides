-- Admin dashboard data (/admin): everything the owner needs to run the pilot, in one call.
-- Computed in SQL so the page stays fast as the pilot grows. Callable only with the service role
-- (the app's server, after checking the signed-in email against ADMIN_EMAILS): never by students,
-- the public, or the Data API's student roles.
--
--   select public.admin_overview(now() - interval '30 days', 50);
--
-- p_from: start of the period (null = all time). p_cap: the daily message cap (from app config).
-- Days are WAT (Africa/Lagos) calendar days, as the daily cap uses.

create or replace function public.admin_overview(p_from timestamptz, p_cap int default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
  bounds as (
    select coalesce(p_from, (select min(created_at) from public.profiles), now()) as t0
  ),
  tr as (
    select t.*, c.code as course_code
    from public.traces t
    left join public.courses c on c.id = t.course_id
    where t.created_at >= (select t0 from bounds)
  ),
  um as (
    select m.* from public.messages m
    where m.role = 'user' and m.created_at >= (select t0 from bounds)
  ),
  fb as (
    select f.* from public.feedback f where f.created_at >= (select t0 from bounds)
  ),
  days as (
    select d::date as day
    from generate_series(
      ((select t0 from bounds) at time zone 'Africa/Lagos')::date,
      (now() at time zone 'Africa/Lagos')::date,
      interval '1 day') d
  )
select jsonb_build_object(
  'generated_at', now(),
  'from', (select t0 from bounds),

  'totals', jsonb_build_object(
    'students_signed_up', (select count(*) from public.profiles),
    'students_onboarded', (select count(*) from public.profiles where onboarded),
    'new_students',       (select count(*) from public.profiles where created_at >= (select t0 from bounds)),
    'active_students',    (select count(distinct user_id) from um),
    'questions',          (select count(*) from um),
    'answers',            (select count(*) from tr),
    'answers_with_errors',(select count(*) from tr where jsonb_array_length(errors) > 0),
    'cost_usd',           (select coalesce(sum(cost_usd), 0) from tr),
    'cost_per_answer',    (select avg(cost_usd) from tr),
    'avg_ttft_ms',        (select round(avg(ttft_ms)) from tr),
    'p95_latency_ms',     (select round(percentile_cont(0.95) within group (order by latency_ms)) from tr where latency_ms is not null),
    'thumbs_up',          (select count(*) from fb where rating = 1),
    'thumbs_down',        (select count(*) from fb where rating = -1),
    'helping_avg',        (select round(avg(score), 2) from public.pulse_responses),
    'helping_n',          (select count(*) from public.pulse_responses),
    'returning_3plus',    (select count(*) from (
                             select user_id from public.messages where role = 'user'
                             group by user_id
                             having count(distinct (created_at at time zone 'Africa/Lagos')::date) >= 3) r),
    'cap_hits',           (select count(*) from public.usage_daily
                             where message_count >= p_cap and day >= ((select t0 from bounds) at time zone 'Africa/Lagos')::date)
  ),

  'daily', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day,
      'questions', coalesce(q.n, 0),
      'active', coalesce(q.students, 0),
      'answers', coalesce(a.n, 0),
      'cost_usd', coalesce(a.cost, 0),
      'avg_ttft_ms', a.ttft,
      'thumbs_up', coalesce(f.up, 0),
      'thumbs_down', coalesce(f.down, 0)
    ) order by d.day), '[]'::jsonb)
    from days d
    left join (select (created_at at time zone 'Africa/Lagos')::date as day, count(*) n, count(distinct user_id) students from um group by 1) q on q.day = d.day
    left join (select (created_at at time zone 'Africa/Lagos')::date as day, count(*) n, sum(cost_usd) cost, round(avg(ttft_ms)) ttft from tr group by 1) a on a.day = d.day
    left join (select (created_at at time zone 'Africa/Lagos')::date as day, count(*) filter (where rating = 1) up, count(*) filter (where rating = -1) down from fb group by 1) f on f.day = d.day
  ),

  'reasons', (
    select coalesce(jsonb_agg(jsonb_build_object('reason', coalesce(reason, 'no reason'), 'n', n) order by n desc), '[]'::jsonb)
    from (select reason, count(*) n from fb where rating = -1 group by reason) r
  ),

  'thumbs_down', (
    select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'created_at', f.created_at, 'reason', f.reason, 'comment', f.comment,
        'course', c.code, 'student', p.email,
        'question', t.user_message, 'answer', m.content,
        'cost_usd', t.cost_usd, 'latency_ms', t.latency_ms
      ) x
      from fb f
      join public.messages m on m.id = f.message_id
      left join public.traces t on t.message_id = m.id
      left join public.conversations cv on cv.id = m.conversation_id
      left join public.courses c on c.id = cv.course_id
      left join public.profiles p on p.id = f.user_id
      where f.rating = -1
      order by f.created_at desc
      limit 100
    ) s
  ),

  'courses', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'title', c.title,
      'students', (select count(distinct um.user_id) from um join public.conversations cv on cv.id = um.conversation_id where cv.course_id = c.id),
      'questions', (select count(*) from um join public.conversations cv on cv.id = um.conversation_id where cv.course_id = c.id),
      'cost_usd', (select coalesce(sum(cost_usd), 0) from tr where tr.course_id = c.id),
      'thumbs_up', (select count(*) from fb join public.messages m on m.id = fb.message_id join public.conversations cv on cv.id = m.conversation_id where cv.course_id = c.id and fb.rating = 1),
      'thumbs_down', (select count(*) from fb join public.messages m on m.id = fb.message_id join public.conversations cv on cv.id = m.conversation_id where cv.course_id = c.id and fb.rating = -1)
    ) order by c.sort_order), '[]'::jsonb)
    from public.courses c
  ),

  'partners', (
    select coalesce(jsonb_agg(jsonb_build_object('partner', partner, 'n', n) order by n desc), '[]'::jsonb)
    from (select coalesce(study_partner, 'not chosen') partner, count(*) n from public.profiles where onboarded group by 1) s
  ),

  'departments', (
    select coalesce(jsonb_agg(jsonb_build_object('department', department, 'n', n) order by n desc), '[]'::jsonb)
    from (select coalesce(department, 'not chosen') department, count(*) n from public.profiles where onboarded group by 1) s
  ),

  'helping', (
    select jsonb_agg(jsonb_build_object('score', s, 'n', (select count(*) from public.pulse_responses where score = s)) order by s)
    from generate_series(1, 5) s
  ),

  'recent', (
    select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', t.id, 'created_at', t.created_at, 'course', t.course_code, 'student', p.email,
        'question', t.user_message, 'answer', left(t.output_text, 4000),
        'cost_usd', t.cost_usd, 'ttft_ms', t.ttft_ms, 'latency_ms', t.latency_ms,
        'input_tokens', t.input_tokens, 'output_tokens', t.output_tokens,
        'tools', (select coalesce(jsonb_agg(tc->>'name'), '[]'::jsonb) from jsonb_array_elements(t.tool_calls) tc),
        'cited', jsonb_array_length(t.citations),
        'invalid_citations', jsonb_array_length(t.invalid_citations),
        'errors', t.errors,
        'rating', (select f.rating from public.feedback f where f.message_id = t.message_id limit 1)
      ) x
      from tr t
      left join public.profiles p on p.id = t.user_id
      order by t.created_at desc
      limit 150
    ) s
  ),

  'slowest', (
    select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'course', course_code, 'question', user_message, 'latency_ms', latency_ms, 'ttft_ms', ttft_ms, 'cost_usd', cost_usd) order by latency_ms desc), '[]'::jsonb)
    from (select * from tr where latency_ms is not null order by latency_ms desc limit 10) s
  ),

  'costliest', (
    select coalesce(jsonb_agg(jsonb_build_object('created_at', created_at, 'course', course_code, 'question', user_message, 'cost_usd', cost_usd, 'input_tokens', input_tokens, 'output_tokens', output_tokens) order by cost_usd desc), '[]'::jsonb)
    from (select * from tr where cost_usd is not null order by cost_usd desc limit 10) s
  ),

  'error_codes', (
    select coalesce(jsonb_agg(jsonb_build_object('code', code, 'n', n) order by n desc), '[]'::jsonb)
    from (select e->>'code' code, count(*) n from tr, jsonb_array_elements(tr.errors) e group by 1) s
  ),

  'students', (
    select coalesce(jsonb_agg(x order by (x->>'questions')::int desc, x->>'last_active' desc nulls last), '[]'::jsonb) from (
      select jsonb_build_object(
        'email', p.email, 'name', p.display_name, 'department', p.department, 'partner', p.study_partner,
        'joined', p.created_at, 'onboarded', p.onboarded,
        'questions', (select count(*) from um where um.user_id = p.id),
        'questions_all_time', (select count(*) from public.messages m where m.user_id = p.id and m.role = 'user'),
        'cost_usd', (select coalesce(sum(cost_usd), 0) from tr where tr.user_id = p.id),
        'last_active', (select max(created_at) from public.messages m where m.user_id = p.id),
        'thumbs_up', (select count(*) from public.feedback f where f.user_id = p.id and f.rating = 1),
        'thumbs_down', (select count(*) from public.feedback f where f.user_id = p.id and f.rating = -1),
        'helping', (select score from public.pulse_responses r where r.user_id = p.id)
      ) x
      from public.profiles p
      order by p.created_at desc
      limit 500
    ) s
  )
);
$$;

revoke all on function public.admin_overview(timestamptz, int) from public, anon, authenticated;
grant execute on function public.admin_overview(timestamptz, int) to service_role;
