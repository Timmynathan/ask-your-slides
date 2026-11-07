-- Retrieval and usage-cap functions (PRD §10.3, F8).

-- ─────────────────────────────────────────────────────────────
-- match_slides: hybrid search for ONE course.
-- Based on https://supabase.com/docs/guides/ai/hybrid-search, with three changes:
--   1. Course filter on both arms (the model can never reach another course).
--   2. Keyword arm ORs the query terms. The guide's websearch_to_tsquery ANDs them, so a natural
--      question ("how does LL(1) parsing handle conflicts") matches almost nothing; ranking with
--      ts_rank_cd still puts slides with more of the terms first.
--   3. Returns the titles of the neighbouring slides (PRD §10.3 step 4).
-- security invoker: RLS on slides applies to whoever calls it.
-- ─────────────────────────────────────────────────────────────
create or replace function public.match_slides(
  p_course_id        uuid,
  p_query_embedding  extensions.vector(1024),
  p_query_text       text,
  p_k                int default 8
)
returns table (
  slide_id      uuid,
  slide_key     text,
  deck_id       uuid,
  deck_title    text,
  deck_order    int,
  slide_number  int,
  slide_count   int,
  title         text,
  chunk_text    text,
  prev_title    text,
  next_title    text,
  score         double precision
)
language sql stable security invoker set search_path = public, extensions
as $$
  with
  q as (
    -- plainto_tsquery joins terms with &; turn that into | for recall. Stop-word-only input gives
    -- an empty string, which becomes null, which matches nothing (vector arm still runs).
    select nullif(replace(plainto_tsquery('english', coalesce(p_query_text, ''))::text, ' & ', ' | '), '')::tsquery as tsq
  ),
  semantic as (
    select s.id, row_number() over (order by s.embedding <=> p_query_embedding, s.id) as rank
    from slides s
    where s.course_id = p_course_id and s.embedding is not null and p_query_embedding is not null
    order by s.embedding <=> p_query_embedding, s.id
    limit 20
  ),
  keyword as (
    select s.id, row_number() over (order by ts_rank_cd(s.fts, q.tsq) desc, s.id) as rank
    from slides s, q
    where s.course_id = p_course_id and s.fts @@ q.tsq
    order by ts_rank_cd(s.fts, q.tsq) desc, s.id
    limit 20
  ),
  fused as (
    -- Reciprocal Rank Fusion, k = 60.
    select coalesce(se.id, kw.id) as id,
           coalesce(1.0 / (60 + se.rank), 0.0) + coalesce(1.0 / (60 + kw.rank), 0.0) as score
    from semantic se
    full outer join keyword kw on kw.id = se.id
    order by score desc, id
    limit least(greatest(coalesce(p_k, 8), 1), 20)
  )
  select s.id, s.slide_key, d.id, d.title, d.deck_order, s.slide_number, d.slide_count,
         s.title, s.chunk_text, prev.title, nxt.title, f.score::double precision
  from fused f
  join slides s on s.id = f.id
  join decks d  on d.id = s.deck_id
  left join slides prev on prev.deck_id = s.deck_id and prev.slide_number = s.slide_number - 1
  left join slides nxt  on nxt.deck_id  = s.deck_id and nxt.slide_number  = s.slide_number + 1
  order by f.score desc, s.id;
$$;

grant execute on function public.match_slides(uuid, extensions.vector, text, int) to authenticated, service_role;
revoke execute on function public.match_slides(uuid, extensions.vector, text, int) from anon, public;

-- ─────────────────────────────────────────────────────────────
-- Daily cap (F8). Day boundary = midnight WAT (Africa/Lagos, UTC+1, no DST).
-- ─────────────────────────────────────────────────────────────
create or replace function public.wat_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Lagos')::date;
$$;

-- Atomically takes one message from today's allowance. Called by /api/chat (service role) BEFORE
-- the model runs, so two parallel requests can't both slip past the cap.
-- Returns allowed = false (and does not count) when the cap is already reached.
create or replace function public.consume_message(p_user_id uuid, p_cap int)
returns table (allowed boolean, used int)
language plpgsql security definer set search_path = '' as $$
declare
  v_used int;
begin
  insert into public.usage_daily as u (user_id, day, message_count)
  values (p_user_id, public.wat_today(), 1)
  on conflict (user_id, day) do update
    set message_count = u.message_count + 1
    where u.message_count < p_cap
  returning u.message_count into v_used;

  if v_used is null then
    select u.message_count into v_used from public.usage_daily u
    where u.user_id = p_user_id and u.day = public.wat_today();
    return query select false, v_used;
  else
    return query select true, v_used;
  end if;
end $$;

revoke execute on function public.consume_message(uuid, int) from anon, authenticated, public;
grant execute on function public.consume_message(uuid, int) to service_role;

-- Gives a refund when a turn fails before the model produced anything, so a crash doesn't cost
-- the student one of their 50.
create or replace function public.refund_message(p_user_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.usage_daily set message_count = greatest(message_count - 1, 0)
  where user_id = p_user_id and day = public.wat_today();
$$;

revoke execute on function public.refund_message(uuid) from anon, authenticated, public;
grant execute on function public.refund_message(uuid) to service_role;

-- The signed-in student's own count for today, so the UI can show "n left" on load without
-- usage_daily being readable.
create or replace function public.my_usage_today()
returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select message_count from public.usage_daily
                   where user_id = auth.uid() and day = public.wat_today()), 0);
$$;

revoke execute on function public.my_usage_today() from anon, public;
grant execute on function public.my_usage_today() to authenticated;
