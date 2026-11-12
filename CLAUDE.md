# AskYourSlides — project context for Claude Code

Read this first, then PRD.md (source of truth for behaviour) and `git log -20`.

## What this is
- AskYourSlides (askyourslides.com): an agentic RAG study assistant for Pan-Atlantic University (PAU) students.
- Students sign in with an @pau.edu.ng email, pick their programme once, then chat per course and per topic.
  Answers come from the course's own lecture materials and past questions, cited to the slide/page.
- Positioning: a quick companion to ChatGPT, not a replacement. Edge: slides already loaded, structured by
  topic, kept current; answers cite the exact slide; past-question practice and exam map.
- Also the source of real user traces for Proofline (the owner's agent eval harness).

## Status (Nov 2026)
- Programmes live (Nov 2026): 10 final-year programmes, 60 courses: CS, Software Eng, Mechanical Eng (500-level),
  ISMS, Mass Comm, Film & Multimedia, Business Admin, Economics, Finance, Accounting. Placeholder codes
  (code_confirmed: false) show only the title. 11 calculation courses (calculation_heavy: true) get the
  calculate/optimize tools; their formula pages were read with Sonnet. Slide images are WebP q75 (free 1 GB plan).
- Past questions phases 1–3 done for CS (extraction, tagging, model answers, exam map, practice, topic chips).
  ISMS past papers not added yet (source ZIP exists; must match papers on course code AND title).
- Pilot plan: free; launch to final-year students ~21 Nov 2026; exams from 5 Dec 2026.

## Stack and models
- Next.js (App Router) on Vercel, Vercel AI SDK for streaming + tools.
- Supabase: Auth (email OTP, @pau.edu.ng only, custom SMTP via Resend from noreply@mail.askyourslides.com),
  Postgres + pgvector + full-text search (hybrid search with RRF), Storage for slide images.
  New key format: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (server only), DATABASE_URL (session pooler).
- Chat model: Claude Haiku 5.5 (`claude-haiku-5-5`, env CHAT_MODEL). Stay on Haiku by default.
- Past-paper OCR + model answers: Batch API, env PAST_Q_MODEL (default `claude-sonnet-5-5`).
- Embeddings: Voyage `voyage-4` (input_type document/query). NOT OpenAI.
- Domain/DNS: Namecheap.

## Budget rules (important)
- Anthropic API credit is small (~$18 at last check). Before any paid batch/ingestion run, print a cost
  estimate and ask before running. Keep prompt caching on. Daily per-student message cap stays on.

## Data layout
- `data/pau/catalog.yaml`: institution → schools → programmes → levels → courses.
- Course folder: `data/pau/<school>/<programme>/<level>-level/<CODE>/` with `course.yaml`,
  `<session>/manifest.yaml`, `<session>/slides/`, `past_papers.yaml`, `past_papers/`.
- A course is unique per (institution, programme, code): the same code can exist in several programmes
  with different files. `aliases` in course.yaml = old codes (e.g. CSC420: CSC403, CSC421).
- PAU sometimes reuses a code for a different course in another year (ISM413, ISM414): match on code AND title.
- Material kinds: slides/notes = main source; reading = supporting depth; practical = hands-on (incl. .ipynb, .cs);
  outline = course overview only; other = only when asked directly (student group presentations are labelled
  student work, lower trust); skipped = listed on LMS, not downloaded.
- Folders starting with `_` are ignored. Rows with `review:` are judgment calls the owner may edit.
- Never commit `data/` or `.env`.

## Product decisions (keep unless the owner changes them)
- Topic chats + one whole-course chat per course. Topic chat retrieves the topic first, then widens to the
  course with a clear label.
- Tutor, not gatekeeper: slides set the scope; the agent explains with intuition and examples.
  Slide content is cited `[[s:...]]` and validated server-side; general knowledge goes in `<general>` blocks.
  Thin slides = checklist of what to know, explained fully. Never refuse just because slides are thin.
- Past questions: show counts ("asked in 2 of 3 papers"), never percentages; "based on past papers, not a
  prediction"; generated practice questions always labelled as not from a past paper.
- No help during a live exam; normal revision always fine.

## Ongoing operations
- New slides arrive weekly until the semester ends. Sync = owner signs in to elearning.pau.edu.ng in Chrome,
  new files are detected by LMS cmid and added to the course manifest, then ingestion runs for new files only.

## How to work with the owner
- Build in phases; stop after each phase so the owner can test; commit after each phase.
- A phase is done only when it runs locally and a test or script proves it works.
- Ask before anything that costs money or can't be undone.
