// Does a cited slide support the sentence that cites it? (owner's answer review, 21 Nov 2026)
//
// The stream filter used to accept any slide the model had loaded. In big overviews the model
// guessed slide numbers: "A linked list is a sequence of nodes…" cited a title slide, "AVL balance
// factor" cited a generic tree slide. This scores the overlap of the claim's content words with the
// slide's text (simple stems, so "nodes"/"node", "balanced"/"balance" match). It is deliberately
// lenient: it only flags a citation whose slide shares almost nothing with the claim.

const STOP = new Set(
  `about above after again against also although among another because before being below between both
  could does doing down during each either every from further have having here into itself just more most
  much must never only other ought over same should some such than that their them then there these they
  this those through under until upon very were what when where which while whom whose will with within
  without would your yours slide slides lecture course topic means called example examples using used
  like make makes made also first second third next shows show shown note notes point points part parts
  step steps thing things kind kinds type types way ways case cases well good important main key many
  often usually simply given gives give take takes known number numbers`.split(/\s+/),
);

/** Lower-case word stems of 4+ letters, minus very common words. */
export function stems(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => w.replace(/(ization|isation|ations|ation|ments|ment|ings|ing|ness|ities|ity|ies|ied|ers|er|ed|es|s|al|ly)$/, "").slice(0, 7))
    .filter((w) => w.length >= 3);
}

/** Share of the claim's distinct stems that appear on the slide (0–1), and how many stems the claim has. */
export function supportScore(claim: string, slideText: string): { score: number; words: number } {
  const want = [...new Set(stems(claim))];
  if (!want.length) return { score: 1, words: 0 };
  const have = new Set(stems(slideText));
  const hit = want.filter((w) => have.has(w)).length;
  return { score: hit / want.length, words: want.length };
}

/** Claims this short can't be judged; slides scoring at or below WEAK support almost nothing of it. */
export const MIN_WORDS = 4;
export const WEAK = 0.1;
/** A slide with fewer distinct stems than this says too little to judge a claim against. */
export const THIN_SLIDE = 8;

/** Share of a claim's characters that are digits or maths symbols. */
function mathsShare(claim: string): number {
  const t = claim.replace(/\s+/g, "");
  return t.length ? (t.match(/[0-9=+\-−×÷^²³⁴⁻¹√∑∫θπ()/*<>≤≥]/g) ?? []).length / t.length : 0;
}

/** A worked maths step: formulas, powers, sums of numbers. Its words rarely match the slide's. */
function isMaths(claim: string): boolean {
  return mathsShare(claim) > 0.08 || /\$\$|[=^√∫θπ]|\d\s*[−+×÷*/]\s*\d|\d+(st|nd|rd|th) power/.test(claim);
}

/** Keep a citation unless its slide clearly shares almost nothing with the claim. Moving it to
 *  another slide was tried on the real answers and picked the right slide only about a third of
 *  the time, so a clearly wrong citation is dropped instead (the claim stays, uncited). Nearly
 *  empty slides (title, contact, picture) and maths steps are never judged. */
export function supportsClaim(claim: string, slideText: string | undefined): { ok: boolean; score: number } {
  if (slideText === undefined) return { ok: true, score: 1 };
  const { score, words } = supportScore(claim, slideText);
  if (words < MIN_WORDS || score > WEAK) return { ok: true, score };
  if (new Set(stems(slideText)).size < THIN_SLIDE || isMaths(claim)) return { ok: true, score };
  return { ok: false, score };
}
