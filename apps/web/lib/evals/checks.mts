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
 *  before it. Lead-ins ending in ':' , questions, bold sub-headings and the not-covered /
 *  thin-slides opening lines don't count. */
export function uncitedSentences(text: string): string[] {
  return outsideGeneral(text)
    .split(/(?<=[.!?](?:\s*\[\[s:[A-Za-z0-9-]+\]\])*)\s+(?!\[\[s:)|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.replace(new RegExp(MARKER_SOURCE, "g"), "").replace(/[^A-Za-z]/g, "").length > 25)
    .filter((s) => !new RegExp(MARKER_SOURCE).test(s))
    .filter((s) => !/^\*\*[^*]+\*\*$/.test(s))
    .filter((s) => !/[:?]$/.test(s) && !/^your slides (don't cover this|only outline this)/i.test(s));
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

// ── Calculation courses (golden cases from the slides' own worked examples) ──────────────────

/** Every number written in an answer, with thousands separators, LaTeX "{,}" and "\," removed.
 *  "₦9,505,468.75" → 9505468.75; "24.8\%" → 24.8; "5{,}000{,}000" → 5000000. */
export function numbersIn(text: string): number[] {
  const flat = text
    .replace(/\[\[s:[A-Za-z0-9-]+\]\]/g, " ") // slide keys are not answers
    // "−N151,093", "-₦151,093", "negative N184,072", "(N151,093)" → -151093
    .replace(/[−–]/g, "-")
    .replace(/\bnegative\s+(?=[N₦$]?\s?\d)/gi, "-")
    .replace(/-\s?[N₦$]\s?(?=\d)/g, "-")
    .replace(/\(\s?[N₦$]?\s?(\d[\d,]*(?:\.\d+)?)\s?\)/g, "-$1")
    .replace(/\{,\}/g, ",")
    .replace(/\\[,;!]/g, "")
    .replace(/(\d)\s(?=\d{3}\b)/g, "$1,"); // "1 000 000"
  return [...flat.matchAll(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(Math.abs(b) * tol, 1e-9);

/** Is `value` (or its percentage form) one of the numbers? Default tolerance 0.5%: the slides
 *  round to 2–4 significant figures. */
export function hasNumber(numbers: number[], value: number, tol = 0.005): number | null {
  return numbers.find((n) => near(n, value, tol) || near(n, value * 100, tol) || near(n * 100, value, tol)) ?? null;
}

export interface NumberCheck {
  /** What the number is, e.g. "cost of equity (DGM)". */
  label: string;
  /** Any of these is accepted (e.g. the exact value and the slide's rounded one). */
  any: number[];
  tol?: number;
}

/** For each expected number: found in the answer? and was it computed by a tool this turn? */
export function checkNumbers(answer: string, expected: NumberCheck[], computed: string[]) {
  const said = numbersIn(answer);
  const tool = computed.flatMap((v) => numbersIn(v));
  return expected.map((e) => {
    const found = e.any.map((v) => hasNumber(said, v, e.tol)).find((n) => n !== null) ?? null;
    // The tool's value may be in another unit than the answer's (4,490,000 vs "₦4.49m"): either form counts.
    const fromTool = found !== null && (hasNumber(tool, found, e.tol ?? 0.005) !== null || e.any.some((v) => hasNumber(tool, v, e.tol) !== null));
    return { label: e.label, found, fromTool };
  });
}
