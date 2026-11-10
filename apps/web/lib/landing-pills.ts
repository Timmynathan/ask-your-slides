// Landing page course pills (owner, Nov 2026): a few at a time, mixing programmes so every student
// sees their own codes early. Pure, unit-tested.

/** Prefixes first, in this order; any other prefix follows alphabetically. */
export const PREFIX_ORDER = ["CSC", "INS", "ISM"];
export const VISIBLE_PILLS = 6;

/** Round-robin across prefixes (CSC, INS, ISM, then others), codes in order within each:
 *  CSC402, INS401, ISM403, CMS411, CSC409, ISM410, … */
export function pillQueue(codes: string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const code of [...new Set(codes)].sort()) {
    const prefix = code.replace(/\d.*$/, "");
    groups.set(prefix, [...(groups.get(prefix) ?? []), code]);
  }
  const rank = (p: string) => (PREFIX_ORDER.includes(p) ? PREFIX_ORDER.indexOf(p) : PREFIX_ORDER.length);
  const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const out: string[] = [];
  const longest = Math.max(0, ...[...groups.values()].map((g) => g.length));
  for (let i = 0; i < longest; i++) for (const p of order) if (groups.get(p)![i]) out.push(groups.get(p)![i]);
  return out;
}

/** The next code for a slot: the first in the queue (after `cursor`) not already showing. */
export function nextCode(queue: string[], showing: string[], cursor: number): { code: string; cursor: number } | null {
  for (let step = 1; step <= queue.length; step++) {
    const i = (cursor + step) % queue.length;
    if (!showing.includes(queue[i])) return { code: queue[i], cursor: i };
  }
  return null;
}
