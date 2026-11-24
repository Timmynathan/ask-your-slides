# AskYourSlides — project context for Claude Code

Read this first, then PRD.md (source of truth for behaviour) and `git log -20`.

## What this is
- AskYourSlides (askyourslides.com): an agentic RAG study assistant for Pan-Atlantic University (PAU) students.
- Students sign in with an @pau.edu.ng email, pick their programme once, then chat per course and per topic.
  Answers come from the course's own lecture materials and past questions, cited to the slide/page.
- Positioning: a quick companion to ChatGPT, not a replacement. Edge: slides already loaded, structured by
  topic, kept current; answers cite the exact slide; past-question practice with answers.
- Also the source of real user traces for Proofline (the owner's agent eval harness).

## Status (Nov 2026)
- Programmes live (Nov 2026): 10 final-year programmes, 60 courses: CS, Software Eng, Mechanical Eng (500-level),
  ISMS, Mass Comm, Film & Multimedia, Business Admin, Economics, Finance, Accounting. Placeholder codes
  (code_confirmed: false) show only the title. 11 calculation courses (calculation_heavy: true) get the
  calculate/optimize tools; their formula pages were read with Sonnet. Slide images are WebP q75 (chosen on the free 1 GB plan; Supabase is on Pro since 23 Nov 2026, so storage is no longer tight).
- Past questions (Nov 2026): 85 papers across 9 programmes extracted (Sonnet; scans turned upright with
  Tesseract only when proven; SEN reuses the identical CS papers by file hash). Every paper's printed
  code/title is checked against the course (past_course_match report); the owner asked to publish the
  safest matches (review files in data/). Answers: design v2 (PRD F10): slides retrieved topic first,
  cited [[s:…]], grounding slides|partial|general (general = "Not from your slides…"), Haiku
  (PAST_ANSWER_MODEL). Past questions are Finals only (owner, 14 Nov 2026): Free gets none, except programmes
  in FREE_PAST_PROGRAMMES (plans/config.ts: Mass Comm, Mech Eng; too few papers to sell), open to all.
  Live since 13 Nov 2026 (kill switch: NEXT_PUBLIC_PAST_QUESTIONS=0). The original papers show beside the questions: cleaned page images (npm run ingest:past:pages: straightened, ink and student details removed; papers with answers written in are never shown). BUA401 2024/25 CA blocked by the content filter.
- Plans (PRD F12, Nov 2026): Free and Finals (one-time, manual bank transfer; Paystack was removed
  before launch). Every number/price/date lives in apps/web/lib/plans/config.ts; limits enforced on
  the server (lib/plans/gate.ts); bank details + WhatsApp number are in that config too. Free is 10
  questions a day (FREE_DAILY). Premium courses are OFF (owner, 22 Nov 2026: students felt shut out):
  PREMIUM_COURSES_ON = false, so every course is open on Free and course.yaml `premium: true` has no
  effect; the premium wording is hidden behind that flag. /pay records a pending payment_request and opens
  WhatsApp; Finals is granted ONLY by an admin approval (/admin/payments); no emails: the student sees a "You're on Finals" pop-up. Never grant
  automatically.
- Launch to final-year students Mon 16 Nov 2026; price goes up 27 Nov 23:59 (moved from 22 Nov); exams from 7 Dec 2026.
- App shell (20–21 Nov 2026): one sidebar (components/nav/app-shell.tsx) in the shared layout app/(app)/(shell)/
  for the dashboard, Chat, Past questions, pricing, profile, settings and the course page (the course page
  fills the panel with its topics through a portal, so the sidebar never remounts). General Chat
  (/api/chat/general) picks the best-matching course and forwards to /api/chat. Uploads (photos/PDF of a
  student's own test or notes, read by Claude into user_upload_chunks, searched as your_notes). Feedback
  dialog -> app_feedback. Pricing is one table (components/plans/plan-table.tsx).
- Past-question extraction + answers ran 19–20 Nov: $3.74 of the $8 cap; 7,184 questions answered. Answers rerun
  23 Nov (about 10,700 answered). Flagged papers: 0 of 606 (23 Nov). Before a Sonnet re-read of a flagged paper,
  check for a <name>.review.yaml next to it: a re-read with a different question split breaks its `renumber`;
  re-storing with the cached first read (--force, same PAST_Q_MODEL) is free and applies the review.
- Answer quality (21 Nov 2026): all 132 real answers were reviewed against their slides. Fixed: whole-deck
  "explain every slide" in one answer (32K tokens, routes allow 300 s), "keep going" resumes after the last
  cited slide, follow-ups re-read the previous answer's slides, "5"/"b" resolved to the list item, quiz
  replies marked, no thin-slides opener, no search talk or apology openings (also trimmed on the stream).
  Checks: `npm run check:walkthrough` and `npm run check:replay` (live site, ~3 US cents; cases in
  data/evals/). Phase B done: citations whose slide shares almost nothing with the sentence are dropped
  on the stream (lib/agent/support.ts, logged citation_unsupported; title slides and maths steps are not
  judged); overviews start from list_topics. Phase C done: calculation_heavy on 87 courses (76 added:
  maths, physics, chemistry, statistics, engineering maths/mechanics, accounting/finance basics, INS401);
  maths turns there think briefly (adaptive, effort low); rules for complex numbers, term-by-term
  expansions, signs, LaTeX, and saying when a slide's worked result is wrong (MTH101-10-53 gives 345° for
  −3+3i; the bot now says 135°). Slide content is never corrected or flagged as wrong by the app (owner, 24 Nov 2026: too risky unless 100% sure; e.g. Company Law 16-2 vs 07-6 on CAMA s.96).
- 22–23 Nov 2026: memory aids go topic by topic (one slide search per topic; acronyms must match the
  items' first letters); photographed papers answer every question in the asked structure (ILAC);
  planning text, search talk, stray CJK characters and method-note openers are trimmed on the stream.
  Chat memory: last 20 messages, capped at ~60,000 characters (HISTORY_LIMIT / HISTORY_MAX_CHARS in
  lib/agent/run.ts); photos aren't kept but their text is (messages.photo_text, read by Haiku after the
  answer, lib/uploads/read-photos.ts). The chat box's + takes photos or a PDF (saved as an upload).
  Slides: cited slides of the latest answer load in the background, two pages ahead, signed image links
  reused for 45 min. Recent chats: a full-height list beside the rail (components/nav/recent-chats-panel.tsx,
  GET /api/conversations/recent). Tablets: dashboard side cards beside the courses from 768 px.
- Past-question answers rerun 23 Nov: the first --analyse run lost its saves to an idle DB connection
  (batch results were cached, so nothing was paid twice); ingestion now reconnects after every batch wait.

- Emails (24 Nov 2026): every email is from "The AskYourSlides Team" (noreply@mail.askyourslides.com, replies to
  EMAIL_REPLY_TO, default hello@askyourslides.com), one React Email layout (lib/email/templates.tsx; logos in
  public/email/). Update emails (welcome 1 h after sign-up if no question yet; past questions live; new slides) go
  through email_queue, sent hourly by .github/workflows/emails.yml → /api/cron/emails: max 90/day, 2 per student per
  7 days, Finals first, never to email_updates = false. Sign-in codes use the Supabase Send Email hook
  (/api/auth/email-hook, SEND_EMAIL_HOOK_SECRET). New slides are queued by ingest.py; past questions from /admin/emails.

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
- Revision is always helped, however close the exam ("I have an exam now, tell me what I need to know" gets full help; owner, 23 Nov 2026: no automatic exam blocking, it would misfire). Only a student plainly asking for answers while sitting the exam is declined (prompt rule 15).

## Ongoing operations
- New slides arrive weekly until the semester ends. Sync = owner signs in to elearning.pau.edu.ng in Chrome,
  new files are detected by LMS cmid and added to the course manifest, then ingestion runs for new files only.
  After new slides: `npm run ingest:past -- --analyse --recheck --course <programme/CODE>` regenerates the
  partial/general past answers that the new slides now cover (prints the cost first).

## How to work with the owner
- Build in phases; stop after each phase so the owner can test; commit after each phase.
- A phase is done only when it runs locally and a test or script proves it works.
- Ask before anything that costs money or can't be undone.
