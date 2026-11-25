// Citation validation on the stream (PRD §10.4).
//
// The model writes [[s:SLIDE_KEY]] markers. Each marker is held back until it is complete, then
// forwarded only if a tool returned that slide in this turn; otherwise it is dropped and logged
// (citation_invalid). Tool results always arrive before the text that cites them, so the allowed
// set is known by the time a marker is written. The student never sees an invalid chip.

export const MARKER = /\[\[s:([A-Za-z0-9-]{1,40})\]\]/;
// A marker the model closed with one bracket ("[[s:ISM413-07-10]" then a newline, owner's review
// 22 Nov 2026): taken as the marker once the next character shows it isn't the second "]".
const ONE_BRACKET = /^\[\[s:([A-Za-z0-9-]{1,40})\](?=[^\]]|$)/;
// A string that could still grow into a marker: "[", "[[", "[[s", "[[s:", "[[s:CSC4", "[[s:CSC401-04-12]".
const PARTIAL = /^\[(?:\[(?:s(?::[A-Za-z0-9-]{0,40}\]?)?)?)?$/;
// A made-up marker ("[[nothing cited here]]", owner's eval 25 Nov 2026: written inside a background block to
// show it had no slide): dropped. [[not-covered]] is the app's own tag and passes through.
// Words with spaces only, so code such as [[nested]] or df[['col']] is left alone.
const STRAY = /^\[\[(?!s:|not-covered\]\])[A-Za-z][A-Za-z,.'-]*(?: [A-Za-z,.'-]+){1,8}\]\]/;
const STRAY_PARTIAL = /^\[\[(?!s:)[A-Za-z][A-Za-z ,.'-]{0,60}\]?$/;

export interface CitationFilterEvents {
  isAllowed(key: string): boolean;
  onCited(key: string): void;
  onInvalid(key: string): void;
  /** Does this (allowed) slide support the sentence citing it? Left out: always yes. */
  supports?(key: string, claim: string): boolean;
  onUnsupported?(key: string): void;
}

/** Stateful filter for one text block. push() returns what is safe to show now; flush() the rest. */
export function createCitationFilter(events: CitationFilterEvents) {
  let pending = "";
  // The text since the last marker: the claim the next marker supports. A run of markers
  // ("… [[s:A]] [[s:B]]") all support the same claim.
  let sinceMarker = "";
  let lastClaim = "";
  // After a dropped made-up marker that followed a space: the next space is dropped too.
  let skipSpace = false;
  const claimFor = () => {
    if (sinceMarker.trim()) lastClaim = sinceMarker.split(/\n\s*\n/).pop()!.replace(/<\/?general>/g, "").slice(-400);
    sinceMarker = "";
    return lastClaim;
  };

  function drain(final: boolean): string {
    let out = "";
    const keep = (text: string) => {
      out += text;
      sinceMarker += text;
    };
    while (pending.length) {
      if (skipSpace) {
        skipSpace = false;
        if (pending.startsWith(" ")) pending = pending.slice(1);
        if (!pending.length) break;
      }
      const open = pending.indexOf("[");
      if (open === -1) {
        keep(pending);
        pending = "";
        break;
      }
      keep(pending.slice(0, open));
      pending = pending.slice(open);
      let m = pending.match(MARKER);
      if (!(m && m.index === 0)) {
        // One closing bracket: only when more text follows it (or the block ends), so "[[s:KEY]" that
        // is still waiting for its second "]" isn't cut short.
        const one = pending.match(ONE_BRACKET);
        if (one && (final || pending.length > one[0].length)) m = one;
      }
      if (m && m.index === 0) {
        const key = normalizeKey(m[1]);
        const claim = claimFor();
        if (!events.isAllowed(key)) {
          events.onInvalid(key);
        } else if (events.supports && !events.supports(key, claim)) {
          events.onUnsupported?.(key);
        } else {
          events.onCited(key);
          out += `[[s:${key}]]`;
        }
        pending = pending.slice(m[0].length);
        continue;
      }
      const stray = pending.match(STRAY);
      if (stray) {
        // Drop it with one of the spaces around it, so no double space is left behind.
        pending = pending.slice(stray[0].length);
        skipSpace = /\s$/.test(sinceMarker);
        continue;
      }
      if (!final && (PARTIAL.test(pending) || STRAY_PARTIAL.test(pending))) break; // wait for more text
      keep("[");
      pending = pending.slice(1);
    }
    return out;
  }

  return {
    push(delta: string): string {
      pending += delta;
      return drain(false);
    },
    flush(): string {
      return drain(true);
    },
  };
}

// Small models sometimes change case; keys are upper-case course codes + digits.
export function normalizeKey(key: string): string {
  return key.toUpperCase();
}

/** Every marker in a finished text (for traces and for re-checking stored messages). */
export function citedKeys(text: string): string[] {
  return [...text.matchAll(new RegExp(MARKER, "g"))].map((m) => normalizeKey(m[1]));
}
