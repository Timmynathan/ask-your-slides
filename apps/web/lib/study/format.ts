// Pure display helpers for answers (PRD §13.2). No React, so they are unit-tested directly.

export interface CitationInfo {
  slide_key: string;
  material_title?: string;
  material_kind?: string;
  slide_number?: number;
  topic_title?: string | null;
  outside_topic?: boolean;
}

export type Segment = { kind: "slides" | "general"; text: string };

const OPEN = "<general>";
const CLOSE = "</general>";

/** Split an answer into slide text and <general> blocks. Works on a half-streamed answer: an
 *  unclosed block runs to the end, and a tag still being typed ("<gen") is hidden. */
export function splitAnswer(raw: string): Segment[] {
  const text = hidePartialTag(raw);
  const out: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf(OPEN, i);
    if (open === -1) {
      out.push({ kind: "slides", text: text.slice(i) });
      break;
    }
    if (open > i) out.push({ kind: "slides", text: text.slice(i, open) });
    const close = text.indexOf(CLOSE, open + OPEN.length);
    const end = close === -1 ? text.length : close;
    out.push({ kind: "general", text: text.slice(open + OPEN.length, end) });
    i = close === -1 ? text.length : close + CLOSE.length;
  }
  return out.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text.length > 0);
}

function hidePartialTag(text: string): string {
  const lt = text.lastIndexOf("<");
  if (lt === -1) return text;
  const tail = text.slice(lt);
  return (OPEN.startsWith(tail) || CLOSE.startsWith(tail)) && tail !== OPEN && tail !== CLOSE ? text.slice(0, lt) : text;
}

const MARKER = /\[\[s:([A-Za-z0-9-]+)\]\]/g;

/** Citation markers → markdown links the renderer turns into chips. A marker still being typed
 *  ("[[s:CSC4") is hidden rather than shown as raw text. */
export function markersToLinks(text: string): string {
  return text.replace(MARKER, (_, key: string) => ` [${key.toUpperCase()}](#cite:${key.toUpperCase()})`).replace(/\[\[s?:?[A-Za-z0-9-]*\]?$/, "");
}

export function isCiteHref(href: string | undefined): href is string {
  return !!href && href.startsWith("#cite:");
}

export function citeKey(href: string): string {
  return href.slice("#cite:".length);
}

/** Slide number from a key, for chips shown before the answer's metadata arrives. */
export function slideNumberFromKey(key: string): number {
  return Number(key.split("-").at(-1));
}

const normal = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Chip parts by kind (PRD §13.2): "Parsing" + "Slide 12", "Reading: Contextual Integrity" + "p. 4".
 *  In a topic chat, a chip from another topic is prefixed with that topic, unless the material's
 *  title already says the same thing. The unit is kept separate so it is never truncated. */
export function chipParts(c: CitationInfo, opts: { showTopic?: boolean } = {}): { title: string; unit: string } {
  const n = c.slide_number ?? slideNumberFromKey(c.slide_key);
  if (!c.material_title) return { title: "", unit: `Slide ${n}` };
  const unit = c.material_kind === "slides" ? `Slide ${n}` : `p. ${n}`;
  let title = c.material_kind === "reading" ? `Reading: ${c.material_title}` : c.material_title;
  if (opts.showTopic && c.outside_topic && c.topic_title && normal(c.topic_title) !== normal(c.material_title)) {
    title = `${c.topic_title} › ${title}`;
  }
  return { title, unit };
}

export function chipLabel(c: CitationInfo, opts: { showTopic?: boolean } = {}): string {
  const { title, unit } = chipParts(c, opts);
  return title ? `${title} · ${unit}` : unit;
}

// One colour per course for chips (PRD §13.2: "course color"). Static class names so Tailwind keeps them.
const COURSE_COLOURS = [
  "bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  "bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  "bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800",
  "bg-indigo-50 text-indigo-800 ring-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-800",
  "bg-teal-50 text-teal-800 ring-teal-200 hover:bg-teal-100 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-800",
  "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200 hover:bg-fuchsia-100 dark:bg-fuchsia-950 dark:text-fuchsia-200 dark:ring-fuchsia-800",
];
export const COURSE_DOTS = ["bg-sky-500", "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500", "bg-fuchsia-500"];

export function courseColour(sortOrder: number): string {
  return COURSE_COLOURS[(sortOrder - 1 + COURSE_COLOURS.length) % COURSE_COLOURS.length];
}

export function courseDot(sortOrder: number): string {
  return COURSE_DOTS[(sortOrder - 1 + COURSE_DOTS.length) % COURSE_DOTS.length];
}

export function displayCode(code: string): string {
  return code.replace(/^([A-Z]+)/, "$1 ");
}
