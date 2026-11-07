-- PAU Study Assistant — core schema (PRD §11).
--
-- Access model (PRD §11.1):
--   courses, decks, slides       read: any signed-in user. write: service role (ingestion) only.
--   conversations                read/write: owner only.
--   messages                     read: owner only. write: service role only — the server writes both
--                                sides of a turn, so a student cannot plant a fake assistant message
--                                into the history the model sees.
--   feedback, pulse_responses    read/write: owner only.
--   traces, usage_daily          service role only (RLS on, no policies, grants revoked).

create extension if not exists vector with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Course content (written by the ingestion CLI)
-- ─────────────────────────────────────────────────────────────

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z]{3}[0-9]{3}$'),   -- e.g. CSC401
  title       text not null,
  lecturer    text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table public.decks (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  -- From the filename prefix (01-, 02-, ...). Used for ordering only; it is NOT a week number —
  -- lecturers number files inconsistently, so the UI never shows it as "Week n".
  deck_order    int  not null,
  title         text not null,
  lecturer      text,
  source_file   text not null,
  content_hash  text not null,
  slide_count   int  not null default 0,
  ingested_at   timestamptz not null default now(),
  unique (course_id, source_file)
);
create index decks_course_idx on public.decks (course_id, deck_order);

create table public.slides (
  id                  uuid primary key default gen_random_uuid(),
  deck_id             uuid not null references public.decks(id) on delete cascade,
  course_id           uuid not null references public.courses(id) on delete cascade,
  slide_number        int  not null check (slide_number >= 1),
  -- Short, stable id the model writes in citation markers: [[s:CSC401-04-12]].
  -- A 36-char UUID is easy for a small model to mis-copy; this is not.
  slide_key           text not null unique check (slide_key ~ '^[A-Z]{3}[0-9]{3}-[0-9]{2,3}-[0-9]{1,3}$'),
  title               text,
  body_text           text,
  visual_description  text,
  speaker_notes       text,
  chunk_text          text not null,
  embedding           extensions.vector(1024),
  fts                 tsvector generated always as (to_tsvector('english', chunk_text)) stored,
  image_path          text,
  unique (deck_id, slide_number)
);
-- No vector index on purpose: every search is filtered to one course (~300 slides), so an exact
-- scan takes a few ms and, unlike HNSW + filter, never silently returns fewer than 20 neighbours.
create index slides_course_idx on public.slides (course_id);
create index slides_fts_idx on public.slides using gin (fts);

-- ─────────────────────────────────────────────────────────────
-- Users and conversations
-- ─────────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text check (char_length(display_name) <= 60),
  onboarded     boolean not null default false,   -- display-name step seen (F1)
  created_at    timestamptz not null default now()
);

-- Every new auth user gets a profile row. security definer: runs as the owner, not the auth admin.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null default 'New chat' check (char_length(title) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index conversations_user_course_idx on public.conversations (user_id, course_id, updated_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,  -- denormalised for RLS + metrics
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  -- [{slide_key, slide_id, deck_title, slide_number}] for assistant messages, validated server-side.
  citations        jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_user_day_idx on public.messages (user_id, created_at);

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating in (-1, 1)),
  reason      text check (reason in ('wrong', 'not_in_slides', 'too_long', 'other')),
  comment     text check (char_length(comment) <= 500),
  created_at  timestamptz not null default now(),
  unique (message_id, user_id)
);

-- "Is this helping you study? (1–5)" — asked once, after the 10th message (F7).
create table public.pulse_responses (
  user_id     uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  score       smallint not null check (score between 1 and 5),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Operations (service role only)
-- ─────────────────────────────────────────────────────────────

-- One row per assistant turn (PRD §15). message_id is null when the turn failed before an
-- assistant message was saved — those failures are exactly the traces worth keeping.
create table public.traces (
  id                    uuid primary key default gen_random_uuid(),
  message_id            uuid unique references public.messages(id) on delete set null,
  conversation_id       uuid references public.conversations(id) on delete set null,
  course_id             uuid references public.courses(id) on delete set null,
  user_id               uuid references public.profiles(id) on delete set null,
  user_message          text not null,
  history_length        int  not null default 0,
  -- [{name, input, slide_keys, status, latency_ms}]
  tool_calls            jsonb not null default '[]'::jsonb,
  retrieved_slide_ids   jsonb not null default '[]'::jsonb,
  output_text           text,
  citations             jsonb not null default '[]'::jsonb,
  invalid_citations     jsonb not null default '[]'::jsonb,
  input_tokens          int,
  output_tokens         int,
  cache_read_tokens     int,
  cache_write_tokens    int,
  cost_usd              numeric(10, 6),
  model                 text not null,
  latency_ms            int,
  ttft_ms               int,
  -- [{code, detail}] e.g. {code: 'citation_invalid', detail: 'CSC401-99-1'}
  errors                jsonb not null default '[]'::jsonb,
  created_at            timestamptz not null default now()
);
create index traces_created_idx on public.traces (created_at);

create table public.usage_daily (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  day            date not null,   -- WAT (Africa/Lagos) calendar day
  message_count  int  not null default 0,
  primary key (user_id, day)
);

-- ─────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────

alter table public.courses          enable row level security;
alter table public.decks            enable row level security;
alter table public.slides           enable row level security;
alter table public.profiles         enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.feedback         enable row level security;
alter table public.pulse_responses  enable row level security;
alter table public.traces           enable row level security;
alter table public.usage_daily      enable row level security;

create policy "signed-in users read courses" on public.courses for select to authenticated using (true);
create policy "signed-in users read decks"   on public.decks   for select to authenticated using (true);
create policy "signed-in users read slides"  on public.slides  for select to authenticated using (true);

create policy "own profile: read"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own conversations" on public.conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own messages: read" on public.messages for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own feedback" on public.feedback for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.messages m
                where m.id = message_id and m.user_id = (select auth.uid()) and m.role = 'assistant')
  );

create policy "own pulse" on public.pulse_responses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Second layer, as in support-agent: the public roles can't even attempt these.
revoke all on public.traces, public.usage_daily from anon, authenticated;
revoke all on public.courses, public.decks, public.slides, public.profiles, public.conversations,
              public.messages, public.feedback, public.pulse_responses from anon;
revoke insert, update, delete on public.courses, public.decks, public.slides, public.messages from authenticated;
-- Students may change only their display name / onboarding flag, never their email.
revoke update on public.profiles from authenticated;
grant update (display_name, onboarded) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Storage: slide PNGs at slides/{course}/{deck}/{n}.png. Private; the app serves expiring
-- signed URLs (PRD §16), so no user-facing storage policies are needed.
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('slides', 'slides', false)
on conflict (id) do nothing;
