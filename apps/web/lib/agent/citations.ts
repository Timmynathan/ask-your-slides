// Citation validation on the stream (PRD §10.4).
//
// The model writes [[s:SLIDE_KEY]] markers. Each marker is held back until it is complete, then
// forwarded only if a tool returned that slide in this turn; otherwise it is dropped and logged
// (citation_invalid). Tool results always arrive before the text that cites them, so the allowed
// set is known by the time a marker is written. The student never sees an invalid chip.

export const MARKER = /\[\[s:([A-Za-z0-9-]{1,40})\]\]/;
// A string that could still grow into a marker: "[", "[[", "[[s", "[[s:", "[[s:CSC4", "[[s:CSC401-04-12]".
const PARTIAL = /^\[(?:\[(?:s(?::[A-Za-z0-9-]{0,40}\]?)?)?)?$/;

export interface CitationFilterEvents {
  isAllowed(key: string): boolean;
  onCited(key: string): void;
  onInvalid(key: string): void;
}

/** Stateful filter for one text block. push() returns what is safe to show now; flush() the rest. */
export function createCitationFilter(events: CitationFilterEvents) {
  let pending = "";

  function drain(final: boolean): string {
    let out = "";
    while (pending.length) {
      const open = pending.indexOf("[");
      if (open === -1) {
        out += pending;
        pending = "";
        break;
      }
      out += pending.slice(0, open);
      pending = pending.slice(open);
      const m = pending.match(MARKER);
      if (m && m.index === 0) {
        const key = normalizeKey(m[1]);
        if (events.isAllowed(key)) {
          events.onCited(key);
          out += `[[s:${key}]]`;
        } else {
          events.onInvalid(key);
        }
        pending = pending.slice(m[0].length);
        continue;
      }
      if (!final && PARTIAL.test(pending)) break; // wait for more text
      out += "[";
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
