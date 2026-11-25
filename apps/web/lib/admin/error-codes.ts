// What each code in a trace's `errors` means, in plain words (owner, 21 Nov 2026: "10 errors" was
// confusing). Most are fixes the server made before the student saw the answer; only `problem` ones
// mean the student saw something go wrong.
export const ERROR_INFO: Record<string, { label: string; problem: boolean; flag?: boolean }> = {
  // Not an error: the student may be in danger or serious distress, and got a caring reply (prompt rule 18).
  wellbeing: { label: "Wellbeing: the student may be in distress; a caring reply with support contacts was given", problem: false, flag: true },
  opening_trimmed: { label: "Opening sentence removed (filler or planning)", problem: false },
  citation_not_covered: { label: "Slide link removed from a 'not covered' answer", problem: false },
  narration_dropped: { label: "Planning sentence removed (\"Let me pull the slides…\")", problem: false },
  citation_invalid: { label: "Slide link removed: the slide wasn't opened in that answer", problem: false },
  citation_unsupported: { label: "Slide link removed: the slide doesn't say what the sentence claims", problem: false },
  superseded: { label: "Student edited the question before the answer finished", problem: false },
  truncated: { label: "Answer cut short (the student saw Continue)", problem: true },
  empty_answer: { label: "No answer produced (the question was refunded)", problem: true },
  model_error: { label: "The AI service failed mid-answer", problem: true },
  tool_failed: { label: "Reading the slides failed", problem: true },
};

export function errorInfo(code: string) {
  return ERROR_INFO[code] ?? { label: code, problem: true };
}

/** Problems the student saw, and fixes made before they saw the answer. */
export function splitErrors(errors: { code: string }[]) {
  const problems = errors.filter((e) => errorInfo(e.code).problem);
  const flags = errors.filter((e) => errorInfo(e.code).flag);
  return { problems, flags, fixes: errors.length - problems.length - flags.length };
}
