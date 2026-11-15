> Historical brief (13 Nov 2026) for the past-questions rollout. PRD.md is the source of truth; the
> "Access" section below is out of date (since 14 Nov, past questions are Finals only, with
> FREE_PAST_PROGRAMMES open to all).

# Claude Code prompt: past questions for all final-year programmes

Read CLAUDE.md, PRD.md (past-questions sections) and `git log -20` first. CS past questions (phases 1–3) already work end to end. This task extends the same pipeline to every programme and changes how answers are produced. Build in phases, and stop after each one so I can test.

## What changed in the data
- 77 new past papers (185 pages) are sorted into 23 course folders across ISMS, Mass Comm, Accounting, Business Admin, Economics and Mechanical Engineering (500-level). Each course has `past_papers.yaml` and `past_papers/`.
- Software Engineering now has copies of the CS papers for the shared courses (CSC409, CSC420, INS401, SEN412 = CSC412, SEN419 = CSC419). Reuse the CS extraction and answers by file hash. Don't pay to process them twice.
- Almost every new paper is scanned (phone photos or scans), so it needs vision OCR. Some photos are rotated: detect and fix orientation before OCR.
- Entries with `review:` are course matches I guessed from the title. When you extract `code_on_paper` and the printed title, compare them to course.yaml. Print a mismatch report and don't publish mismatched papers until I confirm.
- `ECO405/2021-2022_ca.pdf` has some answers typed in by a student. Use only the questions.
- Ignore `data/_pq_staging`, `data/_pq_sheets`, `data/_pq_tools` and `data/_excluded`.

## Answer design (applies to every course, CS included)
1. Model answers come from the course slides. Retrieve from the course's materials (topic first, then the whole course), write the answer from what was retrieved, and cite `[[s:...]]` as in chat.
2. If retrieval finds nothing relevant (use a score threshold plus a "does this context actually cover the question" check), write a general answer inside a `<general>` block with this label: "Not from your slides. Either this topic hasn't been uploaded yet, or it isn't in this year's slides."
3. Store `grounding: slides | partial | general` per answer, and show it in the UI.
4. Calculation questions: show working step by step. MCQs: store the correct option and check student attempts in code, with no AI call.
5. New slides arrive weekly. When a course gets new materials, re-check its `general` and `partial` answers and regenerate those that are now covered.

## Cost plan: version C (approved by the owner)
- The pipeline already exists (`ingestion/past_papers.py`, `past_analysis.py`, `past_estimate.py`). Extend it. Don't rewrite it.
- Split the models. Today extraction and analysis both use PAST_Q_MODEL. Add PAST_ANSWER_MODEL (default `claude-haiku-5-5`) for step 2 (topics, relevance, model answers). Keep PAST_Q_MODEL = `claude-sonnet-5-5` for step 1 (OCR and extraction).
- Before step 2, confirm the slides for every course with papers are in the database (`store.course_id` not None, chunks present). If any are missing, run `npm run ingest` for those courses first and print that cost too.
- Both steps use the Batch API with prompt caching on.
- Expected: about $1 for extraction, then about $0.40 for answers. Run `npm run ingest:past:estimate` and show me the exact figures before each paid step. If either step comes in over $3, stop and ask.

## Access (unchanged pricing)
- Free: exam map, plus 1 practice question per course.
- Finals: all past questions, model answers, and practice with marking.

## Phases
1. Process the new papers: orientation fix, OCR, question extraction, the mismatch report, and the SEN reuse by hash. Stop.
2. Tagging, the exam map per course, and answers using the design above. Stop.
3. UI: grounding labels, the "Not from your slides" banner, a per-course paper count and session list, and the free/Finals gating. Update CLAUDE.md Status. Commit.
