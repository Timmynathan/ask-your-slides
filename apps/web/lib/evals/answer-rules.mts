// The rules every answer is held to in the behaviour checks (scripts/replay-check.mts on real cases,
// scripts/behaviour-check.mts on the committed cases). Shared so both judge answers the same way.

export const GENERAL: { label: string; bad: RegExp }[] = [
  { label: "thin-slides opener", bad: /only outline this/i },
  // Not "the search key" or "the search moves down the tree": database and algorithm courses use the word.
  { label: "talks about searching", bad: /\b(the search (didn'?t|did not|returned|found|turned up|brought|came back|results?)|search results|I searched|let me (gather|pull|fetch|grab))\b/i },
  { label: "apology opening", bad: /^\s*(?:[\p{L}'-]{2,20},\s*)?(you.?re right|i.?m sorry|sorry|apolog)/iu },
  { label: "thinking aloud", bad: /\b(Hmm+,|check that again|Let me calculate it)\b/i },
];

// Reported but not failed: minor slips worth watching.
export const WARN: { label: string; bad: RegExp }[] = [{ label: "citation inside <general>", bad: /<general>(?:(?!<\/general>)[\s\S])*?\[\[s:/ }];

export interface Judged {
  fails: string[];
  warnings: string[];
}

/** Judge one answer: the general rules, the case's own patterns, and what the server logged. */
export function judge(opts: {
  answer: string;
  httpOk: boolean;
  body: string;
  errors: { code: string }[];
  must?: string[];
  mustNot?: string[];
}): Judged {
  const { answer, body } = opts;
  const fails: string[] = [];
  const warnings = WARN.filter((w) => w.bad.test(answer)).map((w) => w.label);
  if (!opts.httpOk) fails.push(`http error: ${body.slice(0, 120)}`);
  if (!answer.trim()) fails.push(`no answer: ${body.match(/"errorText":"([^"]+)"/)?.[1] ?? "empty"}`);
  for (const g of GENERAL) if (g.bad.test(answer)) fails.push(g.label);
  for (const p of opts.must ?? []) if (!new RegExp(p, "iu").test(answer)) fails.push(`missing /${p}/`);
  for (const p of opts.mustNot ?? []) if (new RegExp(p, "iu").test(answer)) fails.push(`has /${p}/`);
  const stripped = opts.errors.filter((e) => e.code === "citation_invalid").length;
  const unsupported = opts.errors.filter((e) => e.code === "citation_unsupported").length;
  if (unsupported > 2) fails.push(`${unsupported} citations to slides that don't say it`);
  else if (unsupported) warnings.push(`${unsupported} citation(s) to a slide that doesn't say it, dropped`);
  if (stripped > 1) fails.push(`${stripped} citations stripped`);
  else if (stripped) warnings.push("1 citation stripped");
  if (/"truncated":true/.test(body)) fails.push("cut short");
  return { fails, warnings };
}
