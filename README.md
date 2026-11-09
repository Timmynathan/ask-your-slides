# Ask Your Slides

Course-scoped study chat for final-year CS students at Pan-Atlantic University. Answers come from
the lecture slides, with slide citations. See [PRD.md](PRD.md) for the full spec.

## Layout

```
apps/web/        Next.js app (phases 3–6)
ingestion/       Python slide ingestion CLI (phase 2)
supabase/        migrations (schema, RLS, match_slides) and SQL tests
evals/           Proofline export format + agent check notes (README), golden set
data/            pau/catalog.yaml + one folder per course — git-ignored, never committed
```

## Prerequisites (macOS)

```bash
brew install uv supabase/tap/supabase postgresql@16   # psql is used by the DB tests
brew install --cask libreoffice                        # PPTX → PDF for ingestion
uv python install 3.12
```

## Setup

1. Create a Supabase project (free tier is fine for development).
2. `cp .env.example .env` and fill in the Supabase values.
   `DATABASE_URL` is the **Session pooler** URI from Supabase → Connect.
3. Apply the schema:
   ```bash
   npm run db:push        # supabase db push against DATABASE_URL
   ```
4. Prove it works:
   ```bash
   npm run test:db
   ```
   This runs `supabase/tests/*.sql` inside a transaction that is rolled back, so it leaves no data behind.

## Ingestion

Course files live in `data/` (git-ignored), laid out for many schools and departments (PRD §9.1):

```
data/pau/catalog.yaml                                  schools → programmes → levels → semesters → course codes
data/pau/<school>/<programme>/<level>-level/<CODE>/
    course.yaml                                        code, title, department, level, semester, aliases, current_session
    <session>/manifest.yaml  + <session>/slides/       topics → materials, each with a kind (source of truth)
    past_papers.yaml         + past_papers/            optional; validated, not ingested yet
```

Paths inside each YAML are relative to that file's folder. Folders starting with `_` are ignored
(`data/_legacy/` keeps the old single-file layout as `manifest_v1.yaml`, `courses_v1.yaml`, `past_papers_v1.yaml`). A
course is unique per institution + programme + code: the same code (e.g. INS401) can live in two
programmes with different files. Needs `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`,
`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL` in `.env`.

```bash
npm run ingest -- --course CSC420 --dry-run   # validate + plan; no API calls, no writes
npm run ingest -- --course CSC420             # ingest one course (every programme that has this code)
npm run ingest -- --course computer-science/INS401   # one programme's course
npm run ingest                                # all courses in the catalog
npm run ingest -- --remove-course computer-science/CSC420   # delete a course, its rows and images
npm run ingest:verify -- --course CSC420 --sample 30   # checks + random slides with image links
```

- **Re-runs are cheap.** Unchanged files are skipped. A file moved to another topic or kind is
  re-embedded only. Vision results are cached in `data/.cache/`, so `--force` costs only embeddings.
- **Vision** (Claude Haiku 5.5) describes slides with real images, charts, equations or diagrams,
  and **transcribes** pages whose text layer is missing or garbled (some PDFs print `!` instead of
  spaces). Template images (logos, banners on most pages) don't count.
- **`kind: skipped`** rows are never ingested. Rows with `review:` are ingested as written and
  listed at the start of each run so they get checked.
- **Slide images** are stored under the course's database id (`<course id>/02/12.png`). Images
  stored before the catalog (under the course code) are moved there by the next ingest run.
- `verify` fails if the database doesn't match the data, any slide lacks an embedding or image,
  or fewer than 80% of topics are found by searching their own title.

## Web app, onboarding and study partners

The landing page is `/` (signed out). After the first sign-in students give a name and choose a study partner (Tobi, Ada, Dr. Musa or Zara: `apps/web/lib/partners.ts`), who then appears throughout the app. Design notes: PRD §13.0.

## Sign-in

```bash
npm --prefix apps/web install
npm run dev            # http://localhost:3000 (reads the repo-root .env)
```

Sign-in: the first time (or after a forgotten password) a 6-digit email code proves the PAU
address and the student creates a password; after that it is email + password. `@pau.edu.ng` only, enforced twice: the `/api/auth/otp` route
rejects other domains before Supabase is called, and the `public.hook_before_user_created` auth hook
makes Supabase itself refuse to create non-PAU accounts. Sessions last 30 days from last use.

One-time Supabase dashboard settings (can't be set from a migration):

1. **Authentication → Hooks → Before User Created** → Postgres → `public.hook_before_user_created`.
2. **Authentication → Email Templates**: both **Confirm signup** and **Magic Link** must show the
   code, e.g. `Your Ask Your Slides code is {{ .Token }}`. (New students get the first, returning
   students the second.)
3. **Authentication → SMTP**: Resend, sender `noreply@mail.askyourslides.com` (done).

`npm run test:e2e:auth` signs a temporary test student in and out against the real project without
sending any email, checks the auth hook, then deletes the test user.

## Status

| Phase | Scope | Proof |
|---|---|---|
| 1 ✅ | Schema, RLS, `match_slides()`, daily-cap functions | `npm run test:db` (19 checks, passing on hosted Supabase) |
| 2 ✅ | Ingestion CLI (manifest-driven) | `npm run test:ingest` (offline) + `npm run ingest:verify -- --course CSC420` |
| 3 ✅ | `@pau.edu.ng` OTP auth | `npm run test:web` + `npm run test:e2e:auth` + `npm run test:db` |
| 4 ✅ | `/api/chat` agent, citations, traces, Proofline export | `npm run test:web` + `npm run check:agent` (real model, ~$0.01) |
| 5 ✅ | Study UI (laptop first): My courses, Topics / chat / Sources, citation chips, beyond-your-slides boxes, slide viewer, voice typing, Search the web | `npm run check:ui` (real browser, laptop + phone, ~$0.002) |
| 6 ✅ | Summaries and quiz (acceptance checks), thumbs up/down with reasons, "Is this helping you study?" after the 10th question, daily cap, pilot metrics views | `npm run check:agent` + `npm run check:ui` + `npm run test:db` |

## Pilot numbers

No admin UI: the numbers are SQL views in the `metrics` schema (closed to students and the public
API). Read them in the Supabase SQL editor:

```sql
select * from metrics.pilot;                        -- the whole pilot in one row: students, questions, cost, thumbs-up %, helping score
select * from metrics.daily order by day desc;      -- per WAT day: active students, questions, answers, cost, speed, thumbs
select * from metrics.thumbs_down order by created_at desc;  -- each thumbs down with its reason, question and answer
select * from metrics.courses;                      -- per course: students, questions, thumbs
select * from metrics.partners;                     -- which study partners students chose
select * from metrics.helping;                      -- "Is this helping you study?" spread (1–5)
```

Every answer's full trace (tools, retrieved slides, tokens, cost, latency) is in `public.traces`;
`npm --prefix apps/web run export:traces` writes them as Proofline JSONL.

## Notes

- **Structure** comes from each course's session manifest
  (`data/pau/<school>/<programme>/<level>-level/<CODE>/<session>/manifest.yaml`): topics → materials. Each
  material has a `kind` (slides, notes, reading, practical, outline, other, skipped). `skipped` is never
  ingested. Materials belong to a course session (`course_sessions`).
- **Courses** are unique per institution + programme + code. `/study/CSC420` picks the student's
  department's course when a code is shared; links add `?programme=` only then.
- **Chats** are whole-course (`topic_id` null) or per topic. Topic chats search the topic first and
  fall back to the whole course with a visible label.
- **Citations** use short slide keys, `[[s:CSC420-02-12]]` = course CSC420, material 02, page 12.
  Keys are unique within a course; the slide viewer asks for `/api/slides/<key>?course=<course id>`.
- **No weeks**: lecturers number files inconsistently, so the unit is the topic, never "Week n".
- **Daily cap** resets at midnight WAT (Africa/Lagos).
