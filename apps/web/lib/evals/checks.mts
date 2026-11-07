// Deterministic answer checks (PRD §15), shared by scripts/agent-check.mts and
// scripts/export-traces.mts so the test and the Proofline export score answers identically.
// Pure functions: no server, no network.

export const MARKER_SOURCE = "\\[\\[s:([A-Za-z0-9-]+)\\]\\]";

export function citedKeys(text: string): string[] {
  return [...text.matchAll(new RegExp(MARKER_SOURCE, "g"))].map((m) => m[1].toUpperCase());
}

export function outsideGeneral(text: string): string {
  return text.replace(/<general>[\s\S]*?<\/general>/g, " ");
}

/** Sentences outside <general> with no citation (heuristic). A citation belongs to the sentence
 *  before it. Lead-ins ending in ':' , questions, bold sub-headings and the not-covered sentence
 *  don't count. */
export function uncitedSentences(text: string): string[] {
  return outsideGeneral(text)
    .split(/(?<=[.!?](?:\s*\[\[s:[A-Za-z0-9-]+\]\])*)\s+(?!\[\[s:)|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(new RegExp(MARKER_SOURCE, "g"), "").replace(/[^A-Za-z]/g, "").length > 25)
    .filter((s) => !new RegExp(MARKER_SOURCE).test(s))
    .filter((s) => !/^\*\*[^*]+\*\*$/.test(s))
    .filter((s) => !/[:?]$/.test(s) && !/^your slides don't cover this/i.test(s));
}

export interface TraceLike {
  tool_calls?: { name: string }[] | null;
  retrieved_slide_ids?: string[] | null;
  output_text?: string | null;
  invalid_citations?: string[] | null;
}

export interface Checks {
  retrieval_before_answer: boolean;
  citations_in_retrieved: boolean;
  citations_in_course: boolean;
  cited_slides: number;
  invalid_citations_removed: number;
  uncited_sentences_outside_general: number;
  not_covered_opening: boolean;
}

export function scoreTrace(t: TraceLike, courseCode: string): Checks {
  const text = t.output_text ?? "";
  const keys = citedKeys(text);
  const retrieved = new Set((t.retrieved_slide_ids ?? []).map((k) => k.toUpperCase()));
  return {
    retrieval_before_answer: (t.tool_calls ?? []).length > 0,
    citations_in_retrieved: keys.every((k) => retrieved.has(k)),
    citations_in_course: keys.every((k) => k.startsWith(`${courseCode}-`)),
    cited_slides: new Set(keys).size,
    invalid_citations_removed: (t.invalid_citations ?? []).length,
    uncited_sentences_outside_general: uncitedSentences(text).length,
    not_covered_opening: /^\s*your slides don't cover this/i.test(text),
  };
}
