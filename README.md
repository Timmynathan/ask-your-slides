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

## Status

| Phase | Scope | Proof |
|---|---|---|
| 1 ✅ | Schema, RLS, `match_slides()`, daily-cap functions | `npm run test:db` (19 checks, passing on hosted Supabase) |
| 2 | Ingestion CLI | — |
| 3 | `@pau.edu.ng` OTP auth | — |
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
