# Evals

## Proofline trace export

```bash
npm run export:traces -- --since 2026-11-21            # → evals/exports/traces-2026-11-21.jsonl
npm run export:traces -- --since 2026-11-21 --until 2026-12-05
```

Exports contain students' questions, so they are written to `evals/exports/` (git-ignored).
Student ids are replaced by a salted SHA-256 pseudonym, stable across exports.

One JSON object per line, one line per assistant turn (`schema: "pau-study-assistant/trace@1"`):

| Field | Content |
|---|---|
| `id`, `created_at`, `model` | trace row id, time (UTC), chat model |
| `input` | `user_message`, `course` (e.g. `CSC420`), `topic` (null = whole-course chat), `conversation_id`, `student` (pseudonym), `history_length` |
| `tool_calls` | `[{name, purpose, input, status, slide_keys, latency_ms, detail, error}]`. The first `search_slides` call is made by the server before the model runs; `detail.scope_used` is `topic`, `course` or `course_fallback` |
| `retrieved_slide_keys` | every slide a tool returned this turn (the only citable set) |
| `output` | `text` (as the student saw it, with `[[s:KEY]]` markers and `<general>` blocks), `citations` (`[{slide_key, slide_id, material_title, material_kind, slide_number, topic_title, outside_topic}]`), `invalid_citations_removed` |
| `metrics` | tokens (incl. cache read/write), `cost_usd`, `latency_ms`, `ttft_ms` |
| `errors` | `[{code, detail}]`: `citation_invalid`, `narration_dropped`, `tool_failed`, `model_error`, `empty_answer` |
| `feedback` | thumbs up/down rows for this answer: `[{rating: 1 or -1, reason, comment, created_at}]` |
| `checks` | deterministic PRD §15 checks (`apps/web/lib/evals/checks.mts`): `retrieval_before_answer`, `citations_in_retrieved`, `citations_in_course`, `cited_slides`, `invalid_citations_removed`, `uncited_sentences_outside_general` (heuristic), `not_covered_opening` |

The LLM-judge check ("cited slide supports the claim") and the golden set run in Proofline.

## Agent check (real model, real slides)

```bash
npm --prefix apps/web run build && npm --prefix apps/web run check:agent
```

Nine scenarios against `/api/chat`: whole-course question, follow-up, topic chat in-topic and
off-topic (labelled fallback), not covered, lecture summary, quiz, OCR'd reading, guards
(daily cap, other student's chat, signed out). About $0.01 per run.
