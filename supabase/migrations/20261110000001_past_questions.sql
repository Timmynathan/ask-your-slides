-- Past questions (PRD F10, §9.4, §11).
--
--   past_papers, past_questions,
--   question_topics, question_slides   read: signed-in users, only papers with status 'ok' (and their
--                                      questions); the answer columns (model_answer, marking_scheme,
--                                      answer_key, answer_explanation) are never granted to students:
--                                      the server sends them after an attempt. Write: service role.
--   practice_attempts                  read: owner only. Write: server only (scores can't be forged).
--   traces.kind                        'chat' | 'marking'.

-- ── papers ─────────────────────────────────────────────────
create table public.past_papers (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  session         text not null check (session ~ '^[0-9]{4}/[0-9]{4}$'),            -- as on the paper's year, e.g. 2025/2026
  type            text not null check (type in ('exam', 'test', 'quiz', 'project', 'assignment', 'other')),
  code_on_paper   text,                                                              -- e.g. 'CSC 403' (shown when it differs from today's code)
  instructions    text,                                                              -- from past_papers.yaml, else as extracted
  rules           jsonb not null default '{}'::jsonb,                                -- {answer_total, compulsory[], per_section[]} as extracted
  duration        text,
  total_marks     numeric(6, 2),
  pages           int,
  scanned         bool not null default false,
  source_file     text not null,                                                     -- relative to data/
  file_hash       text not null,
  status          text not null default 'needs_review' check (status in ('ok', 'needs_review')),
  problems        jsonb not null default '[]'::jsonb,                                -- [{code, severity, detail}] from validation
  extraction_model text,
  fingerprint     text,                                                              -- file hash + model + prompt + review file; unchanged = skipped
  created_at      timestamptz not null default now(),
  unique (course_id, source_file),
  unique (id, course_id)
);
create index past_papers_course_idx on public.past_papers (course_id);

-- ── questions ──────────────────────────────────────────────
create table public.past_questions (
  id                    uuid primary key default gen_random_uuid(),
  course_id             uuid not null references public.courses(id) on delete cascade,
  paper_id              uuid,                                                        -- null for generated practice questions
  origin                text not null default 'past_paper' check (origin in ('past_paper', 'generated')),
  number                text not null,                                               -- 'Q1', 'Q1a', 'Q1a(ii)'
  parent_id             uuid references public.past_questions(id) on delete cascade,
  section               text,                                                        -- 'A', 'B', 'C'
  text                  text not null,                                               -- Markdown: tables, code, diagrams written out
  marks                 numeric(6, 2),
  type                  text not null check (type in ('define', 'explain', 'compare', 'calculate', 'code', 'case_study', 'mcq', 'essay')),
  options               jsonb,                                                       -- MCQ: [{label, text}]
  relevance             text check (relevance in ('covered', 'partial', 'not_covered')),
  extraction_confidence text check (extraction_confidence in ('high', 'medium', 'low')),
  repeat_group          uuid,                                                        -- same idea asked in several papers
  embedding             extensions.vector(1024),
  sort_order            int not null default 0,
  -- answer columns: server only (see grants below)
  model_answer          text,                                                        -- [[s:KEY]] citations + <general> blocks
  marking_scheme        jsonb,                                                       -- [{point, marks}]
  answer_key            text,                                                        -- MCQ: the correct label
  answer_explanation    text,                                                        -- MCQ: one line
  created_at            timestamptz not null default now(),
  constraint past_questions_paper_fk foreign key (paper_id, course_id) references public.past_papers (id, course_id) on delete cascade,
  constraint past_questions_origin_paper_check check ((origin = 'past_paper') = (paper_id is not null)),
  constraint past_questions_mcq_check check (type <> 'mcq' or options is not null)
);
create unique index past_questions_paper_number_key on public.past_questions (paper_id, number) where paper_id is not null;
create index past_questions_course_idx on public.past_questions (course_id);
create index past_questions_parent_idx on public.past_questions (parent_id);

create table public.question_topics (
  question_id  uuid not null references public.past_questions(id) on delete cascade,
  topic_id     uuid not null references public.topics(id) on delete cascade,
  primary key (question_id, topic_id)
);
create index question_topics_topic_idx on public.question_topics (topic_id);

create table public.question_slides (
  question_id  uuid not null references public.past_questions(id) on delete cascade,
  slide_id     uuid not null references public.slides(id) on delete cascade,
  rank         int  not null check (rank >= 1),
  primary key (question_id, slide_id),
  unique (question_id, rank)
);

-- ── attempts ───────────────────────────────────────────────
create table public.practice_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  question_id    uuid not null references public.past_questions(id) on delete cascade,
  answer         text,                                                               -- null when the student only tapped "Show answer"
  score          numeric(6, 2),
  max_score      numeric(6, 2),
  feedback       jsonb,                                                              -- {good[], missing[], summary}
  revealed_only  bool not null default false,
  created_at     timestamptz not null default now(),
  check (revealed_only = (answer is null)),
  check (score is null or (max_score is not null and score >= 0 and score <= max_score))
);
create index practice_attempts_user_idx on public.practice_attempts (user_id, created_at desc);

-- ── traces: marking calls are logged like chat ─────────────
alter table public.traces add column kind text not null default 'chat' check (kind in ('chat', 'marking'));

-- ── row-level security ─────────────────────────────────────
alter table public.past_papers       enable row level security;
alter table public.past_questions    enable row level security;
alter table public.question_topics   enable row level security;
alter table public.question_slides   enable row level security;
alter table public.practice_attempts enable row level security;

create policy "signed-in users read reviewed papers" on public.past_papers for select to authenticated
  using (status = 'ok');
create policy "signed-in users read reviewed questions" on public.past_questions for select to authenticated
  using (origin = 'generated' or exists (select 1 from public.past_papers p where p.id = paper_id and p.status = 'ok'));
create policy "signed-in users read question topics" on public.question_topics for select to authenticated
  using (exists (select 1 from public.past_questions q where q.id = question_id));
create policy "signed-in users read question slides" on public.question_slides for select to authenticated
  using (exists (select 1 from public.past_questions q where q.id = question_id));
create policy "own attempts: read" on public.practice_attempts for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.past_papers, public.past_questions, public.question_topics, public.question_slides,
  public.practice_attempts from anon, authenticated;
grant select on public.past_papers, public.question_topics, public.question_slides, public.practice_attempts to authenticated;
-- Everything except the answer columns and the embedding.
grant select (id, course_id, paper_id, origin, number, parent_id, section, text, marks, type, options, relevance,
  extraction_confidence, repeat_group, sort_order, created_at) on public.past_questions to authenticated;
