// Why an answer needs a look (owner, 23 Nov 2026: "needs attention" in /admin Answers, so problems
// surface without reading every chat). Each reason is a plain phrase; an answer with none is fine.
import { errorInfo } from "./error-codes";

/** Rule 4's opening: the answer says the slides don't cover the question. */
const NOT_COVERED = "Your slides don't cover this";
/** Below this, the first search found nothing about the question (lib/agent/tools.ts NO_MATCH_SIMILARITY). */
const NO_MATCH = 0.3;
const SLOW_MS = 20_000;
const REMOVED_LINKS = 3;

export interface AttentionInput {
  rating: 1 | -1 | null;
  errors: { code: string }[];
  latency_ms: number | null;
  output_text: string | null;
  tool_calls: { name: string; detail?: { similarities?: number[] } }[] | null;
}

export function attentionReasons(r: AttentionInput): string[] {
  const reasons: string[] = [];
  // First: a student who may be in distress (prompt rule 18; owner, 25 Nov 2026).
  if ((r.errors ?? []).some((e) => e.code === "wellbeing")) reasons.push("Wellbeing: student may be in distress");
  if (r.rating === -1) reasons.push("Thumbs down");
  if ((r.output_text ?? "").trimStart().startsWith(NOT_COVERED)) reasons.push("Not covered by the slides");
  const firstSearch = (r.tool_calls ?? []).find((t) => t.name === "search_slides");
  const sims = firstSearch?.detail?.similarities ?? [];
  // Only when the answer then cited no slide either: "keep going" or "quiz me" search weakly by nature
  // but are answered from the slides (weekly report, 23 Nov 2026: those filled the list).
  const citedNothing = !/\[\[s:/.test(r.output_text ?? "");
  if (firstSearch && (sims.length === 0 || Math.max(...sims) < NO_MATCH) && citedNothing) reasons.push("Search found nothing relevant");
  for (const e of r.errors ?? []) {
    const info = errorInfo(e.code);
    if (info.problem && !reasons.includes(info.label)) reasons.push(info.label);
  }
  const removed = (r.errors ?? []).filter((e) => e.code === "citation_invalid" || e.code === "citation_unsupported").length;
  if (removed >= REMOVED_LINKS) reasons.push(`${removed} slide links removed`);
  if ((r.latency_ms ?? 0) > SLOW_MS) reasons.push(`Slow (${Math.round((r.latency_ms ?? 0) / 1000)} s)`);
  return reasons;
}
