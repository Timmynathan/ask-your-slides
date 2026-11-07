# PAU Study Assistant

Course-scoped study chat for final-year CS students at Pan-Atlantic University. Answers come from
the lecture slides, with slide citations. See [PRD.md](PRD.md) for the full spec.

## Layout

```
apps/web/        Next.js app (phases 3–6)
ingestion/       Python slide ingestion CLI (phase 2)
supabase/        migrations (schema, RLS, match_slides) and SQL tests
evals/           golden set + Proofline trace export (phase 4+)
data/            slides + courses.yaml — git-ignored, never committed
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
   `SUPABASE_DB_URL` is the **Session pooler** URI from Supabase → Connect.
3. Apply the schema:
   ```bash
   npm run db:link -- --project-ref <project-ref>   # asks for the DB password once
   npm run db:push
   ```
4. Prove it works:
   ```bash
   npm run test:db
   ```
   This runs `supabase/tests/*.sql` inside a transaction that is rolled back, so it leaves no data behind.

## Status

| Phase | Scope | Proof |
|---|---|---|
| 1 | Schema, RLS, `match_slides()`, daily-cap functions | `npm run test:db` |
| 2 | Ingestion CLI | — |
| 3 | `@pau.edu.ng` OTP auth | — |
| 4 | `/api/chat` agent, citations, traces | — |
| 5 | Dashboard + chat UI | — |
| 6 | Summaries, quiz, feedback, cap | — |

## Notes

- **Citations** use short slide keys, `[[s:CSC401-04-12]]` = course CSC401, deck 04, slide 12.
- **Deck order** comes from the filename prefix (`01-`, `02-`) and is only used for sorting. It is
  not shown as a week number, because lecturers number files inconsistently.
- **Daily cap** resets at midnight WAT (Africa/Lagos).
