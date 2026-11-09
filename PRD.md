# Ask Your Slides — Product Requirements Document

| Field | Value |
|---|---|
| Owner | Nathaniel Ilesanmi |
| Status | v1.2 — in build |
| Date | 7 November 2026 (v1.1: embeddings, auth email, domain, citation keys. v1.2: manifest-driven topics and materials, topic chats) |
| Product name | **Ask Your Slides** (askyourslides.com). An independent study tool for PAU students, not an official PAU product: no PAU branding or logo in the app. |
| App URL | `app.askyourslides.com` (Vercel). Auth email from `noreply@mail.askyourslides.com`. |
| Pilot users | Final-year Computer Science students, Pan-Atlantic University (PAU) |
| Hard deadline | Exams start **5 December 2026**. Pilot must be live by **21 November 2026**. |

---

## 1. Summary

Ask Your Slides is a web app. Final-year CS students sign in with their `@pau.edu.ng` email. They see one chat for each course. Each chat answers questions from that course's lecture slides, and it cites the slide it used.

The slides are already loaded. The student does not upload anything.

The app has a second purpose. It gives real users and real traces to **Proofline**, the agent evaluation harness. Each conversation becomes eval data.

---

## 2. Problem

Students already study with ChatGPT and Claude. But for each study session they must:

1. Find the correct slide decks on the school portal.
2. Download them.
3. Upload them into a chat again and again (file limits, new chats, lost context).
4. Trust answers that do not show which slide they came from.

Near exams, this friction costs time. Answers that mix slide content with general knowledge also confuse students. They do not know what the lecturer actually taught.

---

## 3. Goals and non-goals

### 3.1 Goals (MVP)

| ID | Goal |
|---|---|
| G1 | A student can ask a question about any final-year CS course and get an answer grounded in that course's slides, with slide citations. |
| G2 | The answer shows clearly which parts come from the slides and which parts are general knowledge. |
| G3 | A student can ask for a summary of a topic, a material, or the whole course. |
| G4 | A student can ask the assistant to quiz them on a topic. |
| G5 | Pilot is live for students by 21 November 2026, two weeks before exams. |
| G6 | Every request writes a trace that Proofline can use. |
| G7 | Cost stays predictable, with a hard daily cap per student. |

### 3.2 Non-goals (MVP)

- Other departments or levels.
- Per-student course enrollment. All CS final-year courses show for all students.
- Live web search. General knowledge comes from the model only.
- Past questions (v2).
- Voice (v2).
- Mobile app (v2).
- MCP server / integration with NotebookLM and other tools (v2).
- Student file upload.
- Payments.

---

## 4. Users

| Persona | Description | Main need |
|---|---|---|
| Exam crammer | Final-year CS student, 1–3 weeks before exams. Studies late at night, mostly on a laptop, sometimes on a phone. | Fast, correct answers tied to what the lecturer taught. |
| Catch-up student | Missed lectures. Has never opened some materials. | Summaries of topics, in order. |
| Self-tester | Knows the material, wants to check it. | Quiz questions with answers and slide references. |
| Builder (Nathaniel) | Owner and operator. | Traces, feedback, cost visibility, easy re-ingestion of slides. |

---

## 5. Success metrics

The primary signal is **direct student feedback**: students say it helped, and they can say how.

| Metric | Target for pilot (21 Nov – 5 Dec) | Source |
|---|---|---|
| Students who sign in | ≥ 30 | `profiles` table |
| Weekly active students | ≥ 50% of signed-in students | `messages` table |
| Thumbs-up rate | ≥ 75% of rated answers | `feedback` table |
| Survey: "It helped me study" (agree / strongly agree) | ≥ 70% | End-of-pilot survey |
| Citation precision (cited slide supports the claim) | ≥ 90% on the golden set | Proofline |
| p95 time to first token | ≤ 3 s | Traces |
| LLM cost | ≤ $100 for the full pilot | `usage` table + provider dashboard |

---

## 6. Scope — features and acceptance criteria

### F1. Sign in with school email

- **First time**: the student enters their PAU email and receives a 6-digit code (OTP) once. The code proves they own the address. They then create a password (at least 8 characters).
- **After that**: email + password. No code.
- **Forgot password**: the same code step, then a new password. The old password stops working.
- The email template shows the code (`{{ .Token }}`), not a magic link. Emails go through Resend (custom SMTP in Supabase) from `noreply@mail.askyourslides.com` on a verified domain.
- Only `@pau.edu.ng` addresses are accepted. The server rejects all other domains before it sends a code or checks a password. A Supabase auth hook enforces the same rule, so calling Supabase directly with the public key cannot bypass it.
- A failed password sign-in gives one neutral message ("Wrong email or password…"), whether the account exists or not, so accounts can't be probed. Supabase rate-limits attempts.
- Sessions last 30 days from last use, per browser. Signing out ends only that browser's session.
- First sign-in asks for a display name (optional).

**Acceptance**
- `someone@gmail.com` → error "Use your PAU email." No email is sent, no password is checked.
- `student@pau.edu.ng` first time → code arrives, password created, sign-in works.
- Same student later → signs in with email + password, no code.

### F1c. Delete account

- Account menu → "Delete account" → a dialog says what goes (profile, all chats, ratings) and that it can't be undone; the button stays off until the student types DELETE. `DELETE /api/account` re-checks the session with Supabase Auth, deletes the student's answer logs (traces), signs them out and deletes the auth user, which cascades to profile, conversations, messages, feedback, the 1–5 answer and usage. Sign-in then shows "Your account has been deleted."

### F1e. TEMPORARY: direct sign-up (pilot only)

- While `AUTH_DIRECT_SIGNUP=1`, Create account is PAU email + password, no emailed code (`/api/auth/signup` creates a confirmed account and signs it in). Reason: PAU's Microsoft 365 filter holds back the code emails, and "Continue with Microsoft" (built, hidden; test with `?ms=1`) waits on PAU IT's admin approval. Known risk, accepted by the owner for a private pilot of ~10 students: the address isn't proven, so someone who knows a PAU email could sign up as that student. Turn off (unset the variable on Vercel) once Microsoft sign-in is approved or the code emails arrive.

### F1d. Clear sign-up

- Every "Try for free" opens **/sign-up**: the same page as /sign-in, on the **Create account** tab. Tabs at the top (Create account | Log in) are always visible. Create account shows only the PAU email and a big "Get my code" button, with a 1-2-3 progress line (Email → Code → Password) and step headings ("Check your email", "Create a password"). Log in ("Welcome back") has email + password, a "Forgot password?" link (the same code flow, "Reset your password"), and an outlined "Create a free account" button.

### F1a. Department at onboarding

- The first onboarding step asks for a name (optional) and **"What are you studying?"** (required): a dropdown of Computer Science, Engineering, Economics and Business Administration. Only departments whose slides are in the app can be chosen (now: Computer Science); the others show "(coming soon)" (`apps/web/lib/departments.ts`). Saved on `profiles.department`; My courses shows that department's courses (all courses for students who onboarded before this existed), and the partner's hello names it.

### F1b. Onboarding and study partners

- After the first sign-in: **name** (optional) → **choose your study partner** (four cards) → the partner introduces themselves → studying. A progress bar shows the three steps. Students who signed up before partners existed see the partner step once.
- Four original illustrated partners (`apps/web/lib/partners.ts`, drawn in `components/mascot/mascot.tsx`). Each is framed by the situation it suits ("Best for"), not by how serious it sounds, and each offers exam value, so no single choice looks like the "right" one:
  - **Tobi**, quick & memorable (best for last-minute revision): the gist fast, memory tricks, an exam-day takeaway, an occasional light Nigerian expression.
  - **Ada**, deep understanding (best for learning new topics): numbered steps, defines terms, worked examples, ends longer answers with "In short:".
  - **Dr. Musa**, exam technique (best for exam practice): how answers are marked, common mistakes, answer structure.
  - **Zara**, the all-rounder (best for a bit of everything): a blend of the three, depth matched to the question.
- The partner's first words acknowledge the student's subject ("I know Computer Science can be hard, but I've got you") and say answers come "straight from your school slides". The department is never written into the copy: it comes from `courses.department` (set from `data/courses.yaml`), as do the landing page's department, course list and counts, so adding a department needs no code change.
- The partner changes **how** answers are explained, never the rules: the same retrieval, citations and `<general>` boxes apply to all three (the voice is added after the cached core prompt).
- The partner is present everywhere: landing page, sign-in, onboarding, the sidebar ("Studying with", one tap to change), a greeting on empty chats, an avatar beside every answer, an animated "thinking" state while searching ("Ada is reading your slides…"), and the daily-limit message in their voice.

**Acceptance**
- A new student cannot reach the study workspace without choosing a partner.
- The choice is saved (`profiles.study_partner`) and can be changed any time from the sidebar.

### F2. Dashboard with course and topic chats

- After sign-in, the student lands on **My courses**: one card per course (see §13), like a notebook library. Opening a course shows the study workspace: its Topics panel lists only that course's topics and chats, with a way back to My courses.
- Under the selected course: **Whole course**, then the course's **topics** in order (from the course's session manifest, `data/<institution>/…/<CODE>/<session>/manifest.yaml`). Each has its own conversations and a "New chat" button.
- A chat is either a **whole-course chat** (`topic_id` null) or a **topic chat**.
- The main area shows the selected conversation.
- **Laptop first** (most students study on a laptop): sidebar, chat and slide preview side by side. Still works on a phone: the sidebar becomes a drawer and the preview a bottom sheet.
- Topics with no material yet are hidden from the sidebar (they stay in the manifest and appear once a file is ingested).

**Acceptance**
- All configured courses and their topics show for every student.
- A chat in CSC 420 only ever retrieves CSC 420 material.
- A topic chat retrieves from its topic first. When the topic does not cover the question, it falls back to the whole course and the answer carries a clear label (F3).

### F3. Grounded Q&A with slide citations

- The agent searches the course materials before it answers.
- **Sources by kind** (set per file in the manifest):
  - `slides`, `notes`: main source for answers.
  - `reading`: supporting source, used for depth. Ranked below slides and notes on equal evidence, and labelled as a reading when cited.
  - `practical`: hands-on tasks; used for practical questions and quizzes.
  - `outline`: course-level overview; feeds whole-course overviews, not normal search.
  - `other`: used only when the student asks for it directly (e.g. "the project brief").
- Each claim from the materials has a citation chip, e.g. `Parsing · Slide 12`, `Reading: Contextual integrity · p. 4`.
- Clicking a chip opens a preview of the slide/page image and its text.
- **Topic chats**: search the topic first. If the topic has no good match, search the whole course and show a label above the answer: "Not in *{topic}* — from elsewhere in {course}". Chips from other topics show their topic name.
- If no course material covers the question, the agent says so first.

**Acceptance**
- 100% of citations point to slides that the agent actually retrieved in that turn (validated on the server).
- In a topic chat, an answer that uses material from outside the topic always carries the fallback label.
- On the golden set, ≥ 90% of cited slides support the claim.

### F4. General knowledge marking

- Content that does not come from the slides (an explanation in the partner's own words, an extra example, background) is shown in a soft brand-tinted box with the sparkle icon, labelled **"{Partner}'s explanation · beyond your slides"**. It stays clearly separate from cited slide content, but reads as a bonus, not a warning: students should see that it explains beyond the slides like any AI chat, so they have no reason to go back to ChatGPT.
- The agent uses general knowledge only to explain or extend. It never contradicts the slides without saying so.

**Acceptance**
- In the golden set, every answer segment without a citation is inside a general-knowledge box.
- Visual: the box uses a different background color and an icon. It is easy to see on a phone.

### F5. Summaries

- The student can ask: "Summarize this topic", "Summarize the privacy slides", "Give me an overview of the whole course".
- **Topic summary**: the agent reads the topic's `slides` and `notes` materials in order (readings only if asked, or as a short "go deeper" pointer) and writes a structured summary with citations.
- **Course overview**: built from the course's `outline` materials, then one section per topic in topic order.
- There is no "week" concept: lecturers number and name files inconsistently. The unit is the **topic**, defined in the manifest. A request like "summarize week 3" is matched against `list_topics` (which includes each material's LMS section, often a date range); if more than one topic could fit, the agent asks which one.

**Acceptance**
- A topic summary cites slides from across all of the topic's materials, not only the first few slides.
- A whole-course overview has one section per topic and uses the outline when one exists.

### F6. Quiz me

- The student asks: "Quiz me on regular expressions" (optional: number of questions, difficulty).
- The agent generates questions from retrieved slides. MVP format: one question at a time in chat; the student answers; the agent marks it and cites the slide with the correct answer.

**Acceptance**
- Each question is answerable from the cited slides.
- The agent does not show the answer before the student replies (unless asked).

### F7. Feedback

- Thumbs up / thumbs down on every assistant message. Thumbs down opens an optional short reason ("wrong", "not in slides", "too long", "other" + text).
- A one-question in-app prompt after the 10th message: "Is this helping you study? (1–5)".
- End-of-pilot survey link (external form) shown as a banner from 3 December. **Not shipped for now** (owner's decision, Nov 2026); add it when the survey link exists.
- Built: copy / thumbs up / thumbs down under each finished answer; a thumbs down offers "Wrong", "Not in my slides", "Too long", "Other" (+ a few words). Pressing the same thumb again takes it back. The 1–5 question is asked by the study partner after the student's 10th question; "Not now" waits until the next visit, an answer is final.

### F8. Usage cap

- Each student has a daily cap of **50 messages** (configurable).
- When a student reaches the cap, the input is disabled with the message "Daily limit reached. Resets at midnight (WAT)."

### F9. Admin and operations (no UI in MVP)

- An ingestion CLI loads and re-loads course slides.
- SQL views show daily active users, messages, cost, and thumbs-up rate: `metrics.pilot`, `metrics.daily`, `metrics.thumbs_down`, `metrics.courses`, `metrics.partners`, `metrics.helping` (schema closed to students and the Data API).
- All traces export to Proofline format (JSONL).

### F10. Past questions

Real PAU past papers, turned into practice: which topics the lecturer examines, and a way to answer
those questions and be marked. Pilot data: **10 papers across 6 courses** (`past_papers.yaml` per
course, §9.1); 8 are scanned (no text layer), so every page goes through vision OCR (§9.4).

**Where it lives**
- Study workspace → Topics panel: a **Past questions** entry under *Whole course*. It opens a view
  with two tabs, **Exam map** and **Practice**.
- In a topic chat, a chip **"N past questions"** in the chat header opens practice for that topic
  inside the chat (C). Hidden when the topic has none.

**A. Exam map (per course)**
- One row per topic, in manifest order: **"Asked in 2 of 3 papers"**, total marks across those
  papers, and the question types (explain, compare, calculate…). Counts only, **never percentages**.
- A small mark per paper (session + type) shows which papers asked it.
- Repeat questions (the same idea asked in more than one paper) carry an **"Asked again"** tag and
  list where ("2023/24 exam Q2, 2025/26 exam Q3b").
- Under the map, always: *"Based on past papers, not a prediction."*
- Courses with fewer than 2 papers show *"Few past papers for this course."* instead of a map.
- Only exams and tests count as papers in the map. Projects/assignments are practice only.
- Generated practice questions (D) never appear in the map.

**B. Practice mode**
- Pick a topic or a whole paper. One question at a time, showing its number, marks and source:
  *"2023/24 exam · then CSC 403 · Q2b · 6 marks"* (the original code is shown whenever it differs
  from today's course code, via `course.yaml` `aliases`). Paper rules (e.g. "Answer Question ONE and
  any other three") are shown with whole-paper practice.
- Written questions: the student types an answer → the chat model (Haiku, `CHAT_MODEL`) marks it
  against the question's marks and the saved marking scheme and model answer: an estimated score
  (**"≈ 6/10"**), what was good, what is missing, then the model answer with slide citations.
- MCQs: instant right/wrong plus a short explanation (no model call).
- The model answer and the MCQ key are **never sent to the browser before the student answers**,
  unless they tap **"Show answer"** (that counts as an attempt with no score).
- Every attempt is saved (`practice_attempts`). A marking counts towards the daily message cap (F8).
- Questions whose relevance is `not_covered` stay available, are labelled **"Not in this year's
  slides"**, and come last; `partial` ones are labelled "Partly in this year's slides".

**C. Topic chip.** See *Where it lives*. Practice inside the chat uses the same card as B.

**D. Practice questions for thin courses.** Courses with 0–1 past papers (now CSC418, CSC409,
CSC412, CSC402) also get **PAU-style practice questions**, generated offline from the slides in the
format and mark scheme of PAU papers (sections, "Q1a", marks, the question types PAU uses). Each is
**always** labelled *"Practice question — not from a past paper"*, cited to its slides, and never
counted in the exam map.

**E. Chat tool.** The agent gets `search_past_questions(topic?, query?)` (§10.2) so an answer can
say *"This came up in the 2025/26 exam (Q2b, 6 marks)."* It returns question text, source and marks,
never model answers.

**Rules**
- Past questions are visible only to signed-in `@pau.edu.ng` users (as slides, §16). Paper files
  and page images are not served to students in the pilot; the transcribed text is.
- The integrity rule stands (§10.5 rule 9): no help during a live exam. Practice and marking are
  revision.
- Wording is honest: "estimated score", "based on past papers, not a prediction".

**Acceptance**
- Every paper is either fully extracted or listed in the review report with why (never dropped
  silently): marks that don't add up to the total, missing question numbers, unreadable text, low
  confidence.
- On the golden transcriptions (§15), question numbers, marks and text match.
- The same answer marked twice scores within ±1 mark.
- A signed-out request, or a student's request for another student's attempts, returns nothing.
- The model answer is not in any response before an attempt or "Show answer".

---

## 7. User flow

```mermaid
flowchart LR
    A[Open app] --> B{Signed in?}
    B -- No --> C[Enter PAU email]
    C --> D{Domain is pau.edu.ng?}
    D -- No --> C
    D -- Yes --> E[Enter OTP code]
    E --> F[Dashboard]
    B -- Yes --> F
    F --> G[Select course]
    G --> H[New chat or old chat]
    H --> I[Ask question / summary / quiz]
    I --> J[Answer with slide citations]
    J --> K[Click citation: slide preview]
    J --> L[Thumbs up or down]
```

---

## 8. System architecture

```mermaid
flowchart TB
    subgraph Offline["Ingestion (runs on Nathaniel's Mac)"]
        S[Slides: PPTX / PDF] --> P[Convert + render to PNG]
        P --> T[Extract text]
        P --> V[Vision model: describe diagrams and images]
        T --> CH[One chunk per slide]
        V --> CH
        CH --> EM[Embed: Voyage voyage-4]
    end

    subgraph Supabase
        DB[(Postgres + pgvector + full-text)]
        ST[(Storage: slide images)]
        AU[Auth: email OTP]
    end

    EM --> DB
    P --> ST

    subgraph Web["Next.js app on Vercel (app.askyourslides.com)"]
        UI[Dashboard + course chats]
        API[/api/chat route/]
        AG[Agent loop: Claude Haiku 5.5 + tools]
    end

    UI --> AU
    UI --> API
    API --> AG
    AG -- search_slides / list_topics / get_material_pages --> DB
    AG --> UI
    API --> TR[(traces table)]
    TR --> PL[Proofline evals]
    UI -- slide preview --> ST
```

### 8.1 Technology choices

| Layer | Choice | Reason |
|---|---|---|
| Web app | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Fast to build, good streaming support. |
| Hosting | Vercel (free tier for pilot), `app.askyourslides.com` (domain on Namecheap) | Zero-ops deploys. |
| Auth | Supabase Auth, 6-digit email OTP | Built-in, domain check in the API route **and** a "before user created" auth hook. |
| Auth email | Resend as Supabase custom SMTP, sender `noreply@mail.askyourslides.com` (verified domain) | Supabase's built-in email only reaches project team members; a verified domain also reduces spam-folder risk. |
| Database | Supabase Postgres + `pgvector` + Postgres full-text search | One store for app data, vectors, and keyword search. |
| File storage | Supabase Storage | Slide PNGs for citation previews. |
| Chat model | Claude Haiku 5.5 (`claude-haiku-5-5`) | Low cost, fast, good tool use. Swap is one config value. |
| Vision (ingestion) | Claude Haiku 5.5 with image input | Describes diagrams, tables, equations, scanned slides. |
| Embeddings | Voyage AI `voyage-4` (1024 dims). `input_type: "document"` for slides, `"query"` for searches. | Strong retrieval quality, very low cost. The vector column is `vector(1024)`; changing the model or dimension means a migration and a full re-embed. |
| Agent framework | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) | Streaming, tool calls, React hooks. |
| Ingestion | Python 3.12 script (`python-pptx`, `PyMuPDF`, LibreOffice headless) | Best libraries for PPTX/PDF. |
| Evals | Proofline (own harness) | Real traces from real users. |

---

## 9. Ingestion pipeline

### 9.1 Input layout

Course files are never committed to git. They live in `data/` (git-ignored), one folder per
institution, laid out for many schools and departments. Folders starting with `_` (e.g. `data/_legacy/`,
`data/_excluded/`) are ignored.

```
data/
  pau/
    catalog.yaml                          # institution → schools → programmes → levels → semesters → course codes; order = sidebar order
    sst/                                  # school
      computer-science/                   # programme
        400-level/
          CSC420/
            course.yaml                   # identity: code, title, department, level, semester, aliases, current_session
            2026-2027/                    # one folder per session
              manifest.yaml               # SOURCE OF TRUTH for that session: topics → materials
              slides/
                01-PAU-CSC420-Outline.pdf
                02-PAU-CSC420-Lecture1-Transactions-Indexing.pdf
                ...
            past_papers.yaml              # optional
            past_papers/
```

A course is unique per **(institution, programme, code)**, not by code alone: the same code (e.g.
INS401) can exist in several programmes, each with its own folder and files. Paths inside each YAML
are relative to that file's own folder.

`catalog.yaml` (abridged):

```yaml
institution: {id: pau, name: Pan-Atlantic University}
schools:
- id: sst
  programmes:
  - id: computer-science
    department: Computer Science
    levels:
      400:
        semester_1:
          session: 2026-2027
          courses: [CSC402, CSC409, CSC420, INS401]
```

`course.yaml`:

```yaml
code: CSC420
title: Data Management II
institution: pau
school: sst
programme: computer-science
department: Computer Science     # shown in the app; My courses filters by it
level: 400
semester: 1
aliases: [CSC403, CSC421]        # older codes for the same course (e.g. on past papers)
lms_course_id: 4954
current_session: 2026-2027       # whose manifest is ingested
```

`<session>/manifest.yaml` (abridged):

```yaml
course: CSC420
session: 2026-2027
topics:
- order: 1
  title: Transactions and indexing
materials:
- lms_order: 1                 # = material order; unique per course
  lms_cmid: 82084              # LMS id; identifies the material within its course session
  lms_section: General
  file: slides/01-PAU-CSC420-Outline.pdf
  topic: null                  # null = course-level (whole-course chat only)
  kind: outline                # slides | notes | reading | practical | outline | other | skipped
- lms_order: 4
  file: null
  kind: skipped                # never ingested
```

`past_papers.yaml`: a list of `{file, session (e.g. 2025/2026), type (exam|test|quiz|project|assignment|other),
code_on_paper, pages, scanned, instructions, duration, note}`. Ingested by `npm run ingest:past` (§9.4).

Rules:

- **Catalog and folders must agree**: every course listed in `catalog.yaml` has a folder with `course.yaml`, every `course.yaml` is listed in the catalog, and `course.yaml`'s institution, school, programme, level, semester and `current_session` match its place in both.
- **Materials belong to a course session.** Only the `current_session` manifest is ingested; materials from an earlier session are replaced when `current_session` moves on.
- **Topics** come only from the manifest, in its `order`. A material's `topic` must name one of its course's topics, or be `null`.
- **Kind** decides how a material is used (F3). `skipped` rows are not ingested and not stored.
- Rows with a `review:` note are judgment calls; ingestion prints them so they get checked, but does not block on them.
- **Material order** = `lms_order`, used for sorting only. The material title comes from the filename (minus the order prefix and course code) or the first slide's title.
- Each slide/page gets a short, stable `slide_key`: `{course code}-{material order}-{page}`, e.g. `CSC420-02-12`. Citation markers use it (§10.4). It is unique **within a course**; wherever a key is used (chat, slide viewer) the course is known too.
- Ingestion fails fast, before any upload, if any YAML names a missing file or a file outside the course folder, an unknown topic or kind, or a course the catalog and folders disagree on.

### 9.2 Steps

```mermaid
flowchart LR
    A[File] --> B{PPTX?}
    B -- Yes --> C[LibreOffice: PPTX to PDF]
    B -- No --> D[PDF]
    C --> D
    D --> E[Render each page to PNG 1280px]
    D --> F[Extract text per page]
    A -- PPTX --> G[python-pptx: text + speaker notes]
    E --> H[Vision: describe slide]
    F --> I[Build chunk]
    G --> I
    H --> I
    I --> J[Embed]
    J --> K[Upsert slide row + upload PNG]
```

0. **Read the catalog** and each course's `course.yaml`, session manifest and `past_papers.yaml`, validate them (§9.1), drop `kind: skipped`, and upsert courses (by institution + programme + code), the course session and topics.
1. **Normalize**: convert PPTX/PPT to PDF with LibreOffice headless. This gives one page per slide and a consistent renderer.
2. **Render**: each page → PNG (1280 px wide). Upload to Supabase Storage at `slides/{course id}/{material order}/{n}.png` (the course's database id, because codes repeat across programmes).
3. **Extract text**: from PPTX use `python-pptx` (titles, body, tables, speaker notes). From PDF use PyMuPDF.
4. **Describe visually**: send the PNG to the vision model **only if** the slide has an image, chart, table, or equation, or if extracted text is shorter than 40 characters (scanned slide). Prompt: describe the diagram, transcribe any equations and tables, keep it under 150 words.
5. **Build chunk**: one chunk = one slide or page. Content:
   ```
   Course: CSC420 Data Management II
   Topic: Transactions and indexing
   Material (slides): Transactions and Indexing (slide 12 of 31)
   Title: B+-tree index
   Text: ...
   Visual description: ...
   Speaker notes: ...
   ```
   The header gives context to the embedding and to the model.
6. **Embed** the chunk text with Voyage `voyage-4` (`input_type: "document"`, 1024 dims). Store the vector; Postgres generates the `tsvector` for full-text search from the chunk text.
7. **Idempotency**: each material has a content hash (file bytes + its manifest row). Re-running ingestion skips unchanged materials and replaces changed ones. Moving a file to another topic or kind in the manifest updates it without re-running vision. Materials removed from the manifest (or switched to `skipped`) are deleted.

### 9.4 Past papers (F10)

A separate command, `ingestion/past_papers.py` (`npm run ingest:past`), run after slide ingestion.
One-time per paper, **idempotent by file hash**: an unchanged paper is skipped; every model reply is
cached in `data/.cache`, so a re-run after a fix costs nothing for the parts that didn't change.

1. **Render** each page to PNG with the slides pipeline (higher resolution for scanned pages, for OCR).
2. **Extract** (model `PAST_Q_MODEL`, all pages of a paper in one request) → JSON: paper rules,
   total marks, duration, and per question: `number` (Q1, Q1a, Q1a(ii)), parent, section (A/B/C),
   text (tables, code and diagrams written out in Markdown), marks, type (`define | explain | compare
   | calculate | code | case_study | mcq | essay`), MCQ options and key, confidence.
3. **Validate** and write `data/.reports/past_papers-<date>.md`: sub-part marks vs their parent,
   question marks vs the paper total and its "answer N questions" rule, gaps in numbering,
   `[unreadable]` text, low confidence, the code on the paper vs `code_on_paper` and the course's
   aliases. Problems are listed, never dropped silently. A paper with blocking problems is stored as `needs_review` and hidden from students until it is fixed in its review file (`past_papers/<name>.review.yaml`: overrides, added or dropped questions, accepted problems).
4. **Retrieve** the top slides per question (the same hybrid search as chat, §10.3) and embed the
   question (Voyage, for `search_past_questions` and repeat detection).
5. **Analyse** (`PAST_Q_MODEL`, one request per question, with its retrieved slides and the
   course's topic list): 1+ topics, relevance to this year's slides (`covered | partial |
   not_covered`), and **one model answer** cited with `[[s:...]]` and `<general>` (§10.4), sized to
   the marks (a 6-mark answer ≈ 3 developed points), plus a marking scheme (`[{point, marks}]`). MCQs
   get a one-line explanation. Citations are checked against that question's retrieved slides.
6. **Repeats**: question pairs from different papers of a course with high embedding similarity are
   confirmed by the model in the same step and grouped.
7. **Thin courses** (F10 D): generate PAU-style practice questions from the slides, stored with
   `origin = generated`.

**Models and cost.** Steps 2, 5–7 use the **Message Batches API** (50% off). `PAST_Q_MODEL`
defaults to `claude-sonnet-5-5`; `PAST_Q_MODEL=claude-haiku-5-5` is supported for a tight budget.
The command prints an estimated cost (pages, questions, tokens, $) and asks for confirmation before
submitting. Estimate for all 10 papers: Sonnet 5.5 ≈ $2–4, Haiku 5.5 ≈ $0.10–0.30 (batch prices).

### 9.5 Size and cost estimate

- Pilot data (manifest of 7 Nov 2026): **7 courses, 41 topics, 62 materials** (38 PDF, 24 PPTX; 6 more listed as skipped). Page count to be measured on first ingest; readings can be long, so expect ~2,000–4,000 pages.
- Vision calls on ~50% of slides. Total ingestion cost: about **$1–3**. Embeddings: ~1–2M tokens with Voyage, well under $1 (check current Voyage pricing and free allowance).
- Run time: about 20–40 minutes, with parallel vision calls.

---

## 10. Retrieval and agent design

### 10.1 Agent loop

```mermaid
sequenceDiagram
    participant S as Student
    participant A as /api/chat
    participant M as Claude Haiku 5.5
    participant D as Postgres

    S->>A: message + conversation_id (course and topic come from the conversation)
    A->>A: auth check, daily cap (atomic), save user message
    A->>A: embed query (Voyage voyage-4, input_type query)
    A->>D: first search_slides, run by the server (topic first; widen if another topic is clearly better)
    D-->>A: top slides
    A->>M: system prompt + history + question + that search as the model's own tool call
    M-->>A: optional further tool calls (search again, list_topics, get_material_pages)
    M-->>A: streamed answer with [[s:slide_key]] markers and <general> blocks
    A->>A: validate citations and drop narration on the stream, save message + trace
    A-->>S: streamed answer, rendered with chips and boxes
```

**Why the server runs the first search.** Measured on the real courses (`npm run check:agent`):
prompting alone did not guarantee retrieval (the model sometimes answered from memory), and forcing
the model to call a tool cost a whole extra model round trip before the first word. Running the
first search on the server guarantees retrieval before every answer and saves that round trip. The
query is the student's message, plus the previous question for short follow-ups ("how is that
different?", a quiz answer like "c").

### 10.2 Tools

| Tool | Input | Output | Used for |
|---|---|---|---|
| `search_slides` | `query: string`, `k?: number (default 8)`, `scope?: "topic" \| "course"`, `include?: ("outline" \| "other")[]` | `{scope_used, fell_back, results: [{slide_key, material_title, material_kind, topic_title, outside_topic, slide_number, title, content, prev_title, next_title}]}` | Q&A, quizzes |
| `list_topics` | — | Topics in order, each with its materials `{material, title, kind, pages, lms_section}`, plus course-level materials (outlines, other). `material` is a short key, e.g. `CSC420-02` | Summaries, overviews, "what's in this course?", "week 3" |
| `get_material_pages` | `material` (key from `list_topics`), `from?`, `to?` | Pages in order (max 40 per call, content capped at 1,500 characters per page) | Topic summaries, course overview from the outline |
| `search_past_questions` | `topic?: string`, `query?: string` | Past questions of this course: `{number, text, marks, type, session, paper_type, code_on_paper, topics, relevance, origin}` (max 6). Never the model answer. | "Has this come up in exams?", exam-focused answers (F10) |

`course_id` and `topic_id` are **not** tool parameters. The server injects them from the conversation. The model cannot search other courses.

**Topic-first search with fallback** (`search_slides` in a topic chat):

1. Search the topic (`match_slides(..., p_topic_id)`).
2. Search the whole course at the same time. **Widen** (use the whole-course results) if the topic has no results, or if the best similarity outside the topic beats the best inside it by more than a margin (0.05, to be calibrated on the golden set). A fixed similarity cutoff does not work: across the 7 courses, right-topic scores ranged 0.39–0.75 and wrong-topic scores 0.33–0.71. Results from other topics carry `outside_topic: true`; the response carries `fell_back: true`.
3. The model may also ask for `scope: "course"`, but only when the student asks to connect topics. It is told not to widen on its own; the server decides.
4. When any cited slide is outside the topic, the server sends a `fallback` flag with the answer and the UI shows the label (F3). The label comes from the server, not from the model's wording.

In a whole-course chat, `search_slides` searches all topics; `scope` is ignored.

### 10.3 Hybrid search

0. Candidates: slides of the course, optionally of one topic, whose material kind is in the requested set (default `slides`, `notes`, `practical`, `reading`).
1. Vector search: top 20 by cosine similarity, filtered by `course_id`. The query is embedded with `voyage-4`, `input_type: "query"`. No vector index: one course is ~300 slides, so an exact scan is fast and never drops results the way a filtered approximate index can.
2. Full-text search: top 20 by `ts_rank_cd` on the same course, with query terms OR-ed (AND would match almost nothing for natural questions). This catches exact terms ("LL(1)", "Dijkstra", "CSC 401").
3. Merge with Reciprocal Rank Fusion (k = 60). Multiply a `reading`'s fused score by 0.85 so slides and notes win on equal evidence. Return top `k`, each with its cosine similarity (the fallback signal).
4. Add neighbor context: for each result, include the title of the slide before and after (helps with slides that continue a topic).

Implemented as one Postgres function `match_slides(course_id, query_embedding, query_text, k, topic_id?, kinds?)`.

### 10.4 Answer format contract

The model writes Markdown with two extra conventions:

- **Citation marker**: `[[s:<slide_key>]]` placed after the sentence it supports, e.g. `[[s:CSC401-04-12]]`. Short keys instead of UUIDs, because a small model mis-copies 36-character IDs.
- **General knowledge block**:
  ```
  <general>
  ...text that does not come from the slides...
  </general>
  ```

The server and the UI enforce the contract:

- The UI renders `[[s:...]]` as a citation chip and `<general>` as a highlighted box.
- The server checks that every cited `slide_key` was returned by a tool in this turn. The check runs on the stream: a marker is held back until it is complete, then forwarded or dropped, so the student never sees an invalid chip. Invalid citations are logged as a trace error (`citation_invalid`). This is a Proofline metric.
- Because only this turn's slides count, the agent searches again when it needs a slide from an earlier turn (e.g. marking a quiz answer). Earlier answers go back to the model as history with their markers intact; stripping them made the model believe it had answered without searching.
- **Narration guard**: text the model writes just before a tool call ("I'll pull all its pages…") is held back and dropped (`narration_dropped` in the trace). A text block streams as soon as it is longer than 120 characters or its step ends without a tool call.

### 10.5 System prompt (outline)

1. Role: study assistant for `{course_code} {course_title}` at Pan-Atlantic University; in a topic chat, focused on `{topic_title}`.
2. Always call `search_slides` (or `list_topics` + `get_material_pages` for summaries) before answering a course question.
   - Slides and notes are the main source. Use readings for depth, and say when a point comes from a reading. Use practicals for hands-on questions. Use `other` material only when the student asks for it.
   - In a topic chat, stay on the topic. If results are marked `outside_topic`, say plainly that this part comes from elsewhere in the course.
3. Cite every claim that comes from the slides with `[[s:slide_key]]`.
4. Put all content that is not from the slides inside `<general>` blocks. Keep general knowledge short and useful.
5. If the slides do not cover a question, say "Your slides don't cover this." first, then give general knowledge inside `<general>`. Only for questions: never for summaries or quizzes, and not when the slides answer part of the question (asking for the exact words without these limits made the model open summaries and quizzes with that sentence).
6. If the slides and general knowledge disagree, follow the slides and point out the difference.
7. Quiz mode: one question at a time; wait for the answer; mark it; cite the slide.
8. Style: clear, short paragraphs, examples where they help, exam-focused.
9. Do not help with active exam cheating (e.g. "answer this question during my exam now"). Normal revision is always fine.

### 10.6 Context and cost controls

- Send at most the last 12 messages of history.
- Tool results: max 8 slides for search, 40 pages per material read.
- Max output: 1,200 tokens (2,000 for summaries: when the message asks for a summary/overview or the agent reads whole materials).
- Prompt caching: tools + core instructions are one shared cached prefix for every chat (Haiku 5.5 caches from 512 tokens); a second breakpoint on the new question serves the later steps of the same turn.
- Thinking off for chat (`thinking: disabled`, allowed on Haiku 5.5 at default effort): answers are grounded in retrieved slides, and thinking delays the first word.

**Measured** (agent check, 8 real questions, server on a Mac in Lagos): about $0.001 per answer ($0.0005–0.0026), so 15,000 messages ≈ $15. Time to first word: 2.5–3.7 s for questions, about 5.5 s for a whole-lecture summary. The PRD target (p95 ≤ 3 s) is not met yet; re-measure on Vercel before tuning further (the search step alone is 0.75–1.2 s from here).

---

## 11. Data model

```mermaid
erDiagram
    COURSES ||--o{ TOPICS : has
    COURSES ||--o{ MATERIALS : has
    TOPICS |o--o{ MATERIALS : groups
    COURSES ||--o{ COURSE_SESSIONS : runs
    COURSE_SESSIONS ||--o{ MATERIALS : holds
    MATERIALS ||--o{ SLIDES : has
    PROFILES ||--o{ CONVERSATIONS : owns
    COURSES ||--o{ CONVERSATIONS : scopes
    TOPICS |o--o{ CONVERSATIONS : focuses
    CONVERSATIONS ||--o{ MESSAGES : has
    MESSAGES ||--o{ FEEDBACK : receives
    MESSAGES ||--o| TRACES : logs
    PROFILES ||--o{ USAGE_DAILY : counts
    PROFILES ||--o| PULSE_RESPONSES : answers

    COURSES {
        uuid id PK
        text institution "e.g. pau"
        text school "e.g. sst"
        text programme "e.g. computer-science"
        text code "unique per institution + programme"
        text title
        text department
        int level "e.g. 400"
        int semester "1 or 2"
        text session "current, e.g. 2026-2027"
        text_array aliases "older codes"
        int lms_course_id
        text lecturer
        int sort_order
    }
    COURSE_SESSIONS {
        uuid id PK
        uuid course_id FK
        text session "unique per course"
        int lms_course_id
    }
    TOPICS {
        uuid id PK
        uuid course_id FK
        int topic_order
        text title
    }
    MATERIALS {
        uuid id PK
        uuid course_id FK
        uuid course_session_id FK
        uuid topic_id FK "null = course-level"
        text kind "slides|notes|reading|practical|outline|other"
        int material_order "= manifest lms_order; sort only"
        text title
        text lecturer
        text source_file
        text content_hash
        int page_count
        int lms_cmid
        text lms_section
    }
    SLIDES {
        uuid id PK
        uuid material_id FK
        uuid course_id FK
        int slide_number "slide or page"
        text slide_key "e.g. CSC420-02-12; unique per course"
        text title
        text body_text
        text visual_description
        text speaker_notes
        text chunk_text
        vector embedding "vector(1024), voyage-4"
        tsvector fts
        text image_path
    }
    PROFILES {
        uuid id PK
        text email
        text display_name
        bool onboarded
        timestamptz created_at
    }
    PULSE_RESPONSES {
        uuid user_id PK
        int score "1-5"
        timestamptz created_at
    }
    CONVERSATIONS {
        uuid id PK
        uuid user_id FK
        uuid course_id FK
        uuid topic_id FK "null = whole-course chat"
        text title
        timestamptz updated_at
    }
    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        uuid user_id FK
        text role
        text content
        jsonb citations
        timestamptz created_at
    }
    FEEDBACK {
        uuid id PK
        uuid message_id FK
        uuid user_id FK
        int rating
        text reason
        text comment
    }
    TRACES {
        uuid id PK
        uuid message_id FK
        uuid conversation_id FK
        uuid course_id FK
        uuid user_id FK
        text user_message
        int history_length
        jsonb tool_calls
        jsonb retrieved_slide_ids
        text output_text
        jsonb citations
        jsonb invalid_citations
        int input_tokens
        int output_tokens
        int cache_read_tokens
        int cache_write_tokens
        numeric cost_usd
        int latency_ms
        int ttft_ms
        text model
        jsonb errors
    }
    USAGE_DAILY {
        uuid user_id FK
        date day
        int message_count
    }
```

**Past questions (F10)**, in a separate migration:

- `past_papers`: `id, course_id, session ('2025/2026'), type, code_on_paper, instructions, rules
  (as extracted), duration, total_marks, pages, scanned, source_file, file_hash (unique per course),
  status ('ok' | 'needs_review'), created_at`.
- `past_questions`: `id, course_id, paper_id (null when generated), origin ('past_paper' |
  'generated'), number, parent_id, section, text, marks, type, options jsonb, relevance,
  extraction_confidence, repeat_group, embedding vector(1024), sort_order`; answer columns
  `model_answer, marking_scheme jsonb, answer_key` are **not** selectable by students (served by the
  API after an attempt).
- `question_topics (question_id, topic_id)`, `question_slides (question_id, slide_id, rank)`.
- `practice_attempts (id, user_id, question_id, answer, score, max_score, feedback jsonb,
  revealed_only bool, created_at)`.
- `traces` gains `kind` (`chat` | `marking`) so marking calls are logged and exported like chat.

### 11.1 Row-level security

- `courses`, `topics`, `materials`, `slides`: readable by any authenticated user. Writable only by the service role (ingestion).
- Integrity: a material's topic and a conversation's topic must belong to the same course (composite foreign keys). `skipped` is not a valid stored kind.
- The `slides` table keeps its name; a row is one slide or one page of any material.
- `conversations`, `feedback`, `pulse_responses`: a user can read and write only their own rows.
- `messages`: a user can read only their own rows. Only the server writes messages, so a student cannot plant a fake assistant message into the history the model sees.
- `profiles`: a user can read their own row and change only `display_name` / `onboarded`.
- `traces`, `usage_daily`: service role only. The UI gets today's count from `my_usage_today()`.
- Slide images: private Storage bucket, served only as expiring signed URLs.
- `past_papers`, `past_questions`, `question_topics`, `question_slides`: readable by signed-in users,
  except the answer columns (`model_answer`, `marking_scheme`, `answer_key`), which only the server
  reads. Writable only by the service role. `practice_attempts`: a user reads only their own rows; only
  the server writes them (scores can't be forged).

---

## 12. API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/otp` | Validate domain, request OTP from Supabase. |
| POST | `/api/chat` | Stream an agent answer. Body: `{conversation_id, message}`. Course and topic come from the conversation row. |
| GET | `/api/courses` | List courses with their topics. |
| GET/POST | `/api/conversations` | List / create conversations for a course, optionally a topic (`topic_id` null = whole course). |
| GET | `/api/conversations/:id/messages` | Load history. |
| POST | `/api/feedback` | Save thumbs up/down + reason. |
| GET | `/api/slides/:id` | Slide preview: signed image URL + text. |
| GET | `/api/past/:courseId` | Exam map + question list (no answers). `?topic=` filters. |
| POST | `/api/past/attempt` | `{question_id, answer}` or `{question_id, reveal: true}` → score, feedback, model answer. |

---

## 13. UI

### 13.0 Design system

- Reference: studyfetch.com, used for structure and feel, not copied (no text, artwork, logo or mascot reused).
- Fonts: **Bitter** (headings), **Inter** (text), **JetBrains Mono** (code), all free via Google Fonts.
- Colours: white page and cards, near-black ink `#191919`, cool greys; **PAU navy `#0E1664`** as the brand colour (banner with white text, buttons, links, the student's chat bubbles, selected states), with tints of it for highlights and `#5EA3ED` (from pau.edu.ng's theme) as the bright accent. Logo and line drawings stay black. Dark mode uses matching dark tokens with `#5EA3ED` as the accent.
- Shapes: pill buttons, 25 px card corners, soft rings instead of heavy borders.
- Logo and favicon: one black AI sparkle (a large four-point star and a small one), `apps/web/app/icon.svg`; the PNG app icons are the same drawing on white. Brand name and menus (landing nav, sidebar items): Inter 400, 16 px / 24 px, black (`.type-menu`).
- Landing hero: **"Stop uploading slides to ChatGPT."**, one sentence ("All your {department} course slides are already here, so there's nothing to upload…"), one big navy "Try for free" button, black line drawings in the bottom corners.
- Below the hero, in order: a navy band "Your PAU courses are already here" with the course codes (from the database); "Why not just ChatGPT, Claude or Gemini?" (two cards, three short points each; the products' logos in the comparison card, from Wikimedia Commons in `apps/web/public/logos/`); the demo, framed as a full-screen video player (navy outline, a "DEMO" label and title, Play / Pause / Replay and a progress bar; a big "Watch the demo" play button before it starts; plays once, no loop, and pauses when scrolled away; when it ends, the chat blurs slightly behind a big replay button, no text) (menu: "How it works"; the hero's "See how it works" button, a navy play icon with a pulsing ring, and a bouncing arrow bring it to the top of the screen and start it; otherwise it starts only once the whole demo is on screen): the student types "What is a B+ tree index?", the camera glides up to "Ada is searching your slides" with bouncing dots and holds there for about 2.5 s, then the partner pulls up the slide (PAU deck style, sample content; no real lecturer slide on the public page, per §16), highlights the sentence that answers it with an AI "scan" (a light beam sweeps it, then a blue-violet glow and a "✦ Ada found this" tag), and replies with that sentence, cited (the view zooms in on the question box while it is typed and back out on send); the student then types "I still don't understand" and the partner (Ada, in her own voice) re-explains in plain words, the analogy in the "Ada's explanation · beyond your slides" box, ending with an "In short:" line that points back to the cited slide; then, separate from the video, "Everything in your slides, on demand" / "Built around what your lecturers actually taught." with three feature cards (topic chats, summaries in order with a question box typing "Summarize CSC 402", quiz me); steps; partners; "Exams are coming." call to action; footer. No numbers row and no FAQ until there are real users.
- Third-party logos are their owners' trademarks; using them was the owner's decision. If a takedown request comes, replace the three `<img>` tags in the comparison card with the product names.

### 13.0b Adoption at PAU (low friction)

- Every course link is shareable: a signed-out visitor to `/study/CSC420` signs in and lands on CSC 420 (the target survives sign-in and onboarding; only in-app paths are accepted).
- "Invite coursemates" in the sidebar opens WhatsApp with a message and a link to the course being studied.
- Installable on phones (web app manifest + icons): opens like an app, straight into the courses.
- The landing page lists the student's own PAU course codes and says the slides are the same as on the e-learning portal, so there is nothing to download or upload.
- Landing page (`/`, signed-out only): lilac announcement banner, pill-shaped nav, simple hero (see below), real numbers (7 courses, 1,500+ slides, every answer cited), "start in seconds", features, meet your study partners, FAQ, closing call to action, footer stating it is independent of PAU. No user counts, testimonials or pricing (no honest data for them).

### 13.1 Screens

1. **Sign in** — email field → OTP field. PAU branding kept neutral (no official logo unless the school approves).
2. **My courses** (`/dashboard`, where sign-in and onboarding land) — a library of course cards, laid out like a notebook library: top bar with the logo, "All courses" / "Recently studied" tabs, course search, grid/list toggle (remembered per browser) and an account menu (name, email, sign out). "My courses" heading with a sort menu (course order, recently studied, A to Z), the department line from the data, and a "Continue studying" button that reopens the student's latest chat. Each card: a minimal black line icon picked from the course title (`lib/study/course-icon.ts`, drawings in `components/dashboard/course-icon.tsx`), the title, "CSC 420 · 4 materials · Studied 3 Nov", and a ⋮ menu (open, copy a link for coursemates). Courses with no material are hidden. A card opens the course's study workspace.
3. **Study workspace** (`/study/[code]`; when several programmes share a code, `?programme=` picks one, otherwise the student's department decides), laid out like a notebook and as minimal as My courses (white page, soft grey side panels with no borders, line icons only, neutral citation chips, grey question bubbles, a borderless question box with round mic and send buttons): a top bar (logo back to My courses, the course title with "My courses / CSC 420", Invite coursemates on WhatsApp, the study partner chip "Studying with Ada" that opens the partner picker, account menu), then panels on a soft background. **Topics** (left, a navy panel with white text; the selected scope is a white pill): "New chat", then **Whole course** and the course's topics in order; the selected one folds open to show its chats; "All courses" at the bottom. Only this course's topics, never other courses. **Chat** (middle; the question box has a mic for voice typing via the browser's speech recognition, Nigerian English, shown only where supported; words appear in the box and the student presses Send): the selected scope's name, then the conversation, or the empty state with the partner and three starter buttons. Topic chat: "Explain like I missed class", "Summarize this topic", "Quiz me on this topic". Whole-course chat: "Ask a question", "Course overview", "Quiz me". **Sources** (right): the materials the partner reads for the selected scope (a topic's materials; Whole course lists every material grouped by topic, then course-level ones), each with its kind and page count; clicking one opens it in the slide viewer, which replaces Sources until closed and has previous/next to flip through the whole material. Below xl, Sources opens from a button in the chat header. **Search the web** (top of the left panel): a box kept apart from the slide chat that hands the question to the student's own ChatGPT, Claude or Google in a new tab (a one-tap ChatGPT · Claude · Google switch under the field, remembered per browser). Only the question and the course name leave the app, never slide content. Below lg, Topics is a drawer and the slide a bottom sheet.
3. **Chat** — messages with streaming; citation chips; general-knowledge boxes; thumbs on each answer; input box with remaining daily messages shown when < 10.
4. **Slide preview** — side panel next to the chat (laptop) or bottom sheet at 75% height (phone) with the slide/page image, material title and kind, topic, slide/page number, and a link "Ask about this slide".

### 13.2 Rendering rules

- Citation chip: small rounded label, course color. The slide/page number is never truncated; only the title part is shortened. Text by kind: `slides` → `{material} · Slide 12`; `notes` / `practical` → `{material} · p. 12`; `reading` → `Reading: {material} · p. 4`. Truncated on phones. Never "Week n". Multiple chips can follow one sentence.
- In a topic chat, a chip from another topic adds the topic name (`Privacy › Slides-Privacy · Slide 3`) unless the material title already says it, and the answer has a label above it: "Not in *{topic}*: from elsewhere in {course}".
- Beyond-the-slides box: pale navy tint (`pau-50`), sparkle icon, label "{Partner}'s explanation · beyond your slides" (`components/study/beyond-slides.tsx`, shared by the chat and the landing demo).
- Laptop first: designed and tested at 1440×900; also tested at 375 px (no sideways scrolling, drawer, bottom sheet).

---

## 14. Cost model

Assumptions per message: ~6,000 input tokens (system prompt + history + 8 slides), ~500 output tokens. Prices: Claude Haiku 5.5 at $0.10 per million input tokens and $0.50 per million output tokens (prompts under 100K tokens). Check prices on the provider page before launch.

| Scenario | Messages / month | Estimated LLM cost / month |
|---|---|---|
| 50 students × 10 msgs/day × 30 days | 15,000 | ≈ $13–25 |
| 100 students × 15 msgs/day × 30 days | 45,000 | ≈ $40–70 |
| Worst case: 100 students × 50 msgs/day (cap) | 150,000 | ≈ $130–230 |

Hosting: Vercel free tier and Supabase free tier are enough for the pilot (check the Supabase 500 MB database limit: 3,000 slides × ~8 KB ≈ 25 MB, fine).

**Controls**: daily cap per student (F8), history limit, output limit, prompt caching, and a provider-side monthly spend limit.

**After the pilot** (not MVP): options are a free tier + paid tier, a department or sponsor paying, or a cheaper model for simple turns.

---

## 15. Observability and Proofline integration

Each assistant turn writes one `traces` row:

- Input: user message, course, conversation history length.
- Tool calls: name, arguments, returned `slide_key`s, latency.
- Output: final text, citations, invalid citations removed.
- Tokens, cost, model, total latency, time to first token.
- Feedback (joined later).

**Export**: `npm run export:traces -- --since 2026-11-21` writes JSONL (`evals/README.md` has the format, drafted from this section; student ids are pseudonymised). Each line also carries the deterministic checks below.

**Proofline checks (deterministic first)**:

| Check | Type |
|---|---|
| Agent called a retrieval tool before answering a course question | Deterministic |
| All citations are in the retrieved set | Deterministic |
| No uncited text outside `<general>` blocks (heuristic: sentence-level) | Deterministic |
| Answer stays in the selected course | Deterministic (slide course_id) |
| Cited slide supports the claim | LLM judge |
| "Not covered" questions get the "Your slides don't cover this" response | Deterministic + judge |

**Past questions (F10)**: marking calls write a `traces` row with `kind = marking` (question,
student answer, score, tokens, cost, latency). Golden cases (~10, `npm run check:past`): extraction
accuracy on 3 papers against the owner's manual transcriptions (question numbers, marks, text
similarity), topic tagging against expected topics, and marking consistency (the same answer marked
twice → same score ±1). Transcriptions contain paper text, so they live with the data
(`data/pau/_evals/past_questions/`, git-ignored and skipped by ingestion).

**Golden set**: before launch, write 40 questions (5 per course for 8 courses) with expected slide IDs. Mix: direct facts, diagrams-only facts, cross-slide questions, out-of-scope questions, summary requests. Every thumbs-down in the pilot becomes a candidate golden case.

---

## 16. Security, privacy, and content

- Permission to use the slides is confirmed by the school. Keep a written copy of the approval.
- Slides are only visible to signed-in `@pau.edu.ng` users. Slide images use signed URLs that expire.
- Slides are not committed to git and not used to train any model.
- Store the minimum personal data: email, optional display name, conversations.
- Show a short notice at sign-in: what is stored, that conversations are used to improve the app, and how to request deletion.
- Model provider data settings: use API defaults (no training on API data). Confirm before launch.
- Secrets only in Vercel / Supabase environment variables (and a git-ignored local `.env`). `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are server/ingestion only; only `NEXT_PUBLIC_*` values reach the browser. See `.env.example`.

---

## 17. Timeline

```mermaid
gantt
    dateFormat  YYYY-MM-DD
    title Build and pilot plan
    section Setup
    Repo, Supabase, schema, auth           :a1, 2026-11-08, 2d
    section Ingestion
    Collect slides + manifest.yaml         :b0, 2026-11-08, 3d
    Ingestion pipeline                     :b1, 2026-11-09, 3d
    Ingest all courses + spot check        :b2, after b1, 1d
    section Agent and UI
    Hybrid search function                 :c1, 2026-11-11, 1d
    Agent route + tools + citation check   :c2, after c1, 2d
    Dashboard + chat UI + citations        :c3, 2026-11-12, 4d
    Summaries + quiz mode                  :c4, after c2, 2d
    section Quality
    Golden set + Proofline export          :d1, 2026-11-16, 3d
    Feedback, caps, mobile polish          :d2, 2026-11-17, 3d
    Friends-only test (5 students)         :d3, 2026-11-19, 2d
    section Pilot
    Launch to final-year CS                :milestone, m1, 2026-11-21, 0d
    Pilot + daily fixes                    :e1, 2026-11-21, 14d
    Exams start                            :milestone, m2, 2026-12-05, 0d
```

---

## 18. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Slides are mostly diagrams; text extraction misses content | Weak answers | Vision descriptions per slide; spot-check 30 slides per course. |
| Model mixes general knowledge into "slide" claims | Students trust wrong content | Citation validation, `<general>` contract, Proofline checks, golden set. |
| OTP emails go to spam on the school mail server | Students cannot sign in | Done: Resend custom SMTP from `mail.askyourslides.com` (verified domain). Still to do: test with 3 PAU accounts in phase 3. Resend free tier is 100 emails/day; upgrade if launch-day sign-ins exceed it. |
| Late build, no time before exams | Low value | Fixed scope; friends-only test on 19 Nov; launch 21 Nov. |
| One user drives high cost | Budget | Daily cap, spend limit at provider, usage dashboard. |
| Lecturers object | Must take slides down | Written approval; one-command removal per course. |
| Supabase free project pauses after inactivity | Downtime | Pilot is active daily; upgrade if needed. |

---

## 19. Open questions

1. ~~Exact list of final-year CS courses and materials.~~ Resolved: `data/pau/catalog.yaml` + per-course `course.yaml` and session manifests (7 courses, 41 topics, 62 materials). Rows marked `review:` still need a check.
2. Is the approval in writing, and does it cover all lecturers' slides?
3. Do PAU email accounts receive external OTP emails reliably? (Resend is set up; to be tested with real PAU accounts.)
4. ~~Name and domain for the app.~~ Resolved: `askyourslides.com`; app at `app.askyourslides.com`.
5. Which survey tool for the end-of-pilot survey?
6. Should students see each other's usage at all? (MVP: no.)

---

## 20. Roadmap after MVP

| Version | Feature |
|---|---|
| v1.1 | Past questions: built as F10. Later: timed mock exams, photo upload of handwritten answers. |
| v1.2 | Structured quiz UI (multiple choice cards, score). |
| v1.3 | Voice: ask questions by speech, listen to answers. |
| v2.0 | MCP server: students connect the course slides to Claude, ChatGPT, or other tools. |
| v2.1 | Other levels and departments; per-student course selection. |
| v2.2 | Mobile app (PWA first). |
| v2.3 | Lecturer view: anonymous topics that confuse students most. |

---

## 21. Repository layout (planned)

```
pau-study-assistant/
  PRD.md
  README.md
  apps/web/                 # Next.js app
    app/
      (auth)/sign-in/
      (app)/dashboard/
      api/chat/route.ts
      api/...
    components/chat/        # message, citation chip, general box
    lib/agent/              # system prompt, tools, citation validator
    lib/supabase/
  ingestion/                # Python ingestion CLI
    ingest.py
    manifest.py             # load + validate data/<institution>/catalog.yaml and each course's YAML
    pptx_extract.py
    pdf_extract.py
    vision.py
    embed.py
  supabase/
    migrations/             # schema, RLS, match_slides()
  evals/
    README.md               # Proofline export format, agent check
    golden.jsonl
    exports/                # git-ignored: trace exports (contain student questions)
  data/                     # git-ignored; folders starting with _ are ignored
    pau/
      catalog.yaml          # schools → programmes → levels → semesters → courses
      <school>/<programme>/<level>-level/<CODE>/
        course.yaml
        <session>/manifest.yaml   # topics → materials (source of truth) + slides/
        past_papers.yaml          # + past_papers/
```
