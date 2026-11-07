# PAU Study Assistant

Course-scoped study chat for final-year CS students at Pan-Atlantic University. Answers come from
the lecture slides, with slide citations. See [PRD.md](PRD.md) for the full spec.

## Layout

```
apps/web/        Next.js app (phases 3–6)
ingestion/       Python slide ingestion CLI (phase 2)
supabase/        migrations (schema, RLS, match_slides) and SQL tests
evals/           golden set + Proofline trace export (phase 4+)
data/            courses.yaml, manifest.yaml, slides/ — git-ignored, never committed
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

Course files live in `data/` (git-ignored): `courses.yaml`, `manifest.yaml` (course → topics →
materials, each with a `kind`) and `slides/`. Needs `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`,
`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL` in `.env`.

```bash
npm run ingest -- --course CSC420 --dry-run   # validate + plan; no API calls, no writes
npm run ingest -- --course CSC420             # ingest one course
npm run ingest                                # all courses
npm run ingest -- --remove-course CSC420      # delete a course, its rows and images
npm run ingest:verify -- --course CSC420 --sample 30   # checks + random slides with image links
```

- **Re-runs are cheap.** Unchanged files are skipped. A file moved to another topic or kind is
  re-embedded only. Vision results are cached in `data/.cache/`, so `--force` costs only embeddings.
- **Vision** (Claude Haiku 5.5) describes slides with real images, charts, equations or diagrams,
  and **transcribes** pages whose text layer is missing or garbled (some PDFs print `!` instead of
  spaces). Template images (logos, banners on most pages) don't count.
- **`kind: skipped`** rows are never ingested. Rows with `review:` are ingested as written and
  listed at the start of each run so they get checked.
- `verify` fails if the database doesn't match the manifest, any slide lacks an embedding or image,
  or fewer than 80% of topics are found by searching their own title.

## Web app and sign-in

```bash
npm --prefix apps/web install
npm run dev            # http://localhost:3000 (reads the repo-root .env)
```

Sign-in is a 6-digit email code, `@pau.edu.ng` only, enforced twice: the `/api/auth/otp` route
rejects other domains before Supabase is called, and the `public.hook_before_user_created` auth hook
makes Supabase itself refuse to create non-PAU accounts. Sessions last 30 days from last use.

One-time Supabase dashboard settings (can't be set from a migration):

1. **Authentication → Hooks → Before User Created** → Postgres → `public.hook_before_user_created`.
2. **Authentication → Email Templates**: both **Confirm signup** and **Magic Link** must show the
   code, e.g. `Your PAU Study Assistant code is {{ .Token }}`. (New students get the first, returning
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
| 4 | `/api/chat` agent, citations, traces | — |
| 5 | Dashboard + chat UI | — |
| 6 | Summaries, quiz, feedback, cap | — |

## Notes

- **Structure** comes from `data/manifest.yaml`: course → topics → materials. Each material has a
  `kind` (slides, notes, reading, practical, outline, other, skipped). `skipped` is never ingested.
- **Chats** are whole-course (`topic_id` null) or per topic. Topic chats search the topic first and
  fall back to the whole course with a visible label.
- **Citations** use short slide keys, `[[s:CSC420-02-12]]` = course CSC420, material 02, page 12.
- **No weeks**: lecturers number files inconsistently, so the unit is the topic, never "Week n".
- **Daily cap** resets at midnight WAT (Africa/Lagos).
