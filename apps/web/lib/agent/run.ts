import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { createCitationFilter } from "./citations";
import { supportsClaim } from "./support";
import { CORE_INSTRUCTIONS, TURN_REMINDER, chatContext, partnerContext } from "./prompt";
import { buildTools, getMaterialPages, listTopics, materialKey, newContext, searchSlides, viewSlides, type AgentContext, type Citation } from "./tools";
import { ASKS_VISUAL, pictureSlides } from "./slide-images";
import { PROMPT_VERSION } from "./prompt-version";
import { adminClient, must } from "@/lib/supabase/admin";
import { parseSlideKey } from "@/lib/study/course-code";

export const CHAT_MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
export const HISTORY_LIMIT = 20; // PRD §10.6 (was 12; owner, 23 Nov 2026: longer chats kept losing the thread)
export const HISTORY_MAX_CHARS = 60_000; // about 15k tokens: a chat of long answers drops its oldest turns first
const MAX_STEPS = 6; // a search, a follow-up search or reads, and the answer
const MAX_STEPS_PAPER = 9; // a photographed paper: a search or two per question before the answer
const MEMORY_AID_TOPICS = 16; // whole-course memory aids: topics searched up front (4 slides each)
const MAX_STEPS_CALCULATION = 10; // plus calculate (sometimes twice, after a fix) and optimize
const MAX_OUTPUT_TOKENS = 2000; // room to teach, not just restate the slides
const MAX_OUTPUT_TOKENS_SUMMARY = 12000; // once the agent has read whole materials (3000, then 6000, cut summaries short)
// "Explain every slide" (owner, 21 Nov 2026, after a student's 35-slide walkthroughs stopped at slide
// ~19 four times in a row): the whole deck in one answer. ~32K tokens is ~24K words, a full deck in
// depth; Haiku writes it in about 3 minutes (the route allows 5). It only costs what is written.
const MAX_OUTPUT_TOKENS_WALKTHROUGH = 32000;
const WALKTHROUGH_PAGES = 120; // pages read before a walkthrough (40 per call)
/** Below this best similarity, the first search found little (a second look is offered). */
const WEAK_MATCH = 0.42;
// Claude Haiku 5.5, prompts <= 100K tokens (check the provider page before launch).
const USD_PER_MTOK = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

export interface ChatTurn {
  userId: string;
  conversationId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  /** false: the code is a placeholder (IOH-ETHICS); the course is named by its title only. */
  courseCodeConfirmed?: boolean;
  /** course.yaml calculation_heavy: calculate/optimize tools, calculation rules, more steps. */
  calculationHeavy?: boolean;
  department?: string | null;
  topicId: string | null;
  topicTitle: string | null;
  userMessage: string;
  /** Photos sent with this question (data URLs), shown to the model with it. */
  images?: string[];
  history: ModelMessage[];
  /** Study partner's voice (lib/partners.ts) and the student's first name, if known. */
  partnerVoice?: string | null;
  studentName?: string | null;
  assistantMessageId: string;
  /** The saved question this turn answers. If the student edits it (deleting it) before the
   *  answer finishes, the stale answer is not saved. */
  userMessageId?: string;
  startedAt: number;
  abortSignal?: AbortSignal;
  /** "Ask about this…" from the viewer: this exact slide/section/code part (a key of this course). */
  focusSlide?: string;
  /** What the student's plan doesn't allow (PRD F12), for the model. */
  planNote?: string | null;
  /** Gives back what the plan gate took when the turn produced nothing. */
  refund?: () => Promise<void>;
}

export interface TurnSummary {
  citations: Citation[];
  fallback: { topic: string; used: boolean } | null;
}

/** Earlier answers go back to the model with their citation markers intact. Stripping them made
 *  the model believe it had answered without searching (seen in agent-check). A stale key can't
 *  leak through: citations are only valid for slides retrieved in the current turn. */
export function historyText(content: string): string {
  return content;
}

/** The server's first search: the question, plus the previous question for short follow-ups
 *  ("how is that different from a hash index?", "c", "next one"). */
/** "Explain the code(s) / scripts / notebooks / practicals (in this topic / course)". */
export function asksForCodeOverview(message: string): boolean {
  const m = message.toLowerCase();
  return /\b(codes?|scripts?|notebooks?|practicals?|programs?)\b/.test(m) &&
    /\b(this topic|the topic|this course|the course|this week|all( the)?|each|every|in here)\b/.test(m) &&
    !/\b(line|lines|cell|cells)\s+\d/.test(m); // a specific line/cell is a normal question
}

const MAX_CODE_PAGES = 30; // across all files read for a code overview (scripts are 1 part each; notebooks more)

/** The practical (scripts, notebooks) materials of a topic, or of the course in a whole-course chat,
 *  in teaching order, within a page budget. */
async function practicalMaterials(db: ReturnType<typeof adminClient>, courseId: string, topicId: string | null) {
  let q = db.from("materials").select("material_order, page_count").eq("course_id", courseId).eq("kind", "practical").order("material_order");
  if (topicId) q = q.eq("topic_id", topicId);
  const rows = must(await q) as { material_order: number; page_count: number }[];
  const out: { material_order: number; pages: number }[] = [];
  let budget = MAX_CODE_PAGES;
  for (const r of rows) {
    if (budget <= 0) break;
    const pages = Math.min(r.page_count, budget);
    out.push({ material_order: r.material_order, pages });
    budget -= pages;
  }
  return out;
}

/** The student names a presentation, a group's work, a brief or a template (PRD F11). */
export function asksForOtherMaterial(message: string): boolean {
  return /\b(presentations?|group\s*\d+|groups?['’]s?\s+(work|slides)|briefs?|templates?|handouts?)\b/i.test(message);
}

/** A message that leans on the previous one ("why?", "how is that different…", "more", "scope",
 *  "yes please"), as opposed to a new question of its own ("components of project charter"). Only
 *  these get the previous question added to the server's first search: adding it to a new
 *  question pulled the search towards the old topic (owner's answer review, 21 Nov 2026). */
export function refersBack(message: string): boolean {
  const m = message.trim();
  const words = m.split(/\s+/).filter(Boolean).length;
  if (words <= 3 && !/\b(what|define|explain|meaning)\b/i.test(m)) return true;
  if (m.length >= 120) return false;
  return /\b(it|its|that|this|these|those|they|them|their|same|again|more|another|other|else|above|previous|earlier|last|why|example|examples|instead|also|too|then)\b|^(and|but|so|what about|how about|ok|okay|yes|no)\b/i.test(m);
}

/** "5" or "b" after an answer with a numbered or lettered list: the item the student picked. */
export function pickedItem(message: string, previous: string): string | null {
  const pick = message.trim().match(/^(?:option\s+|number\s+|no\.?\s*)?\(?([0-9]{1,2}|[a-h])\)?[.)]?$/i);
  if (!pick) return null;
  const want = pick[1].toLowerCase();
  for (const line of previous.split("\n")) {
    const m = line.match(/^\s*(?:[-*]\s+)?(?:\*\*)?\(?([0-9]{1,2}|[a-h])[.)](?:\*\*)?\s+(.+)$/i);
    if (m && m[1].toLowerCase() === want) return m[2].replace(/\[\[s:[^\]]+\]\]/g, "").replace(/\*\*/g, "").trim().slice(0, 200);
  }
  return null;
}

/** The question the previous answer ended with (its last sentence with a question mark). */
export function lastQuestion(answer: string): string | null {
  const text = answer.replace(/<\/?general>/g, "").replace(/\[\[s:[^\]]+\]\]/g, "");
  const qs = text.match(/[^.!?\n]*\?/g);
  return qs?.length ? qs[qs.length - 1].replace(/\*\*/g, "").trim().slice(0, 300) : null;
}

/** The previous answer ended by asking the student something (a quiz or check question). */
export function endsWithQuestion(answer: string): boolean {
  const tail = answer.replace(/<\/?general>/g, "").replace(/\[\[s:[^\]]+\]\]/g, "").trim().split("\n").filter((l) => l.trim()).slice(-3).join(" ");
  return /\?/.test(tail);
}

export function preSearchQuery(turn: Pick<ChatTurn, "userMessage" | "history">): string {
  const lastUser = [...turn.history].reverse().find((m) => m.role === "user");
  const previous = typeof lastUser?.content === "string" ? lastUser.content : "";
  return previous && refersBack(turn.userMessage) ? `${previous}\n${turn.userMessage}` : turn.userMessage;
}

const SUMMARY_WORDS = /\b(summar|overview|recap|outline of|go through|walk me through)/i;

/** A maths question: solving, expanding, examples, or a question with numbers or symbols in it. */
export function asksForWorking(message: string): boolean {
  return /\b(solve|calculat|comput|find|expand|example|work (it )?out|evaluat|differentiat|integrat|simplif|prove|coefficient|polar form|show me how|step by step)\w*/i.test(message) || /\d\s*[-+×x*/^=]\s*\d|[=^√∫]/.test(message);
}

/** "Explain every slide", "slide by slide", "all the slides in detail", "explain the whole deck". */
export function asksForWalkthrough(message: string): boolean {
  return (
    /\b(every|each|all(\s+of)?(\s+the)?|all\s+\d+)\s+(single\s+)?(slides?|pages?|notes?|lectures?|decks?)\b/i.test(message) ||
    /\b(slide|page)[\s-]+by[\s-]+(slide|page)\b/i.test(message) ||
    /\b(explain|teach|go through|break down)\b.{0,40}\b(whole|entire|full|complete)\s+(deck|lecture|slides?|topic|week|note|notes)\b/i.test(message)
  );
}

/** "week 7", "wk 7", "lecture 3": the part of the course the student names. */
export function namedPart(message: string): { kind: "week" | "lecture"; n: number } | null {
  const m = message.match(/\b(week|wk|lecture|lec)\.?\s*0?(\d{1,2})\b/i);
  if (!m) return null;
  return { kind: /^(week|wk)$/i.test(m[1]) ? "week" : "lecture", n: Number(m[2]) };
}

/** Does a material's title or file name carry that week or lecture number ("WK7 …", "Lecture-3-…")? */
export function matchesPart(text: string, part: { kind: "week" | "lecture"; n: number }, kind = part.kind): boolean {
  const word = kind === "week" ? "w(?:ee)?k" : "lec(?:ture)?";
  return new RegExp(`(?:^|[^a-z])${word}[\\s_.-]*0?${part.n}(?!\\d)`, "i").test(text);
}

/** "keep going", "continue", "go on", "you stopped at 19… keep going", "why did you stop". */
export function isContinuation(message: string): boolean {
  const m = message.trim();
  if (m.length > 120) return false;
  return /\b(keep+\s*-?\s*go+i*n+g?|continue|carry on|go on|proceed|don'?t stop|why did ?you sto+p+|you stopped|finish (it|the rest)|the rest|next slides?)\b/i.test(m);
}

/** The last slide an earlier answer cited ([[s:CSC402-03-19]] → CSC402-03, slide 19). */
export function lastCitedSlide(content: string): { material: string; number: number } | null {
  const keys = [...content.matchAll(/\[\[s:([^\]\s]+)\]\]/g)].map((m) => m[1]);
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = parseSlideKey(keys[i]);
    if (k) return { material: k.material, number: k.number };
  }
  return null;
}

/** Page ranges covering the slides an earlier answer cited, per deck (gaps of up to 3 slides are
 *  bridged), at most `budget` pages in all, most-cited decks first. */
export function citedRanges(content: string, budget = 40): { material: string; from: number; to: number }[] {
  const byMat = new Map<string, number[]>();
  for (const m of content.matchAll(/\[\[s:([^\]\s]+)\]\]/g)) {
    const k = parseSlideKey(m[1]);
    if (k) byMat.set(k.material, [...(byMat.get(k.material) ?? []), k.number]);
  }
  const out: { material: string; from: number; to: number }[] = [];
  for (const [material, nums] of [...byMat].sort((a, b) => b[1].length - a[1].length)) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b);
    let from = sorted[0];
    let to = sorted[0];
    const push = () => {
      const size = Math.min(to - from + 1, 40, budget);
      if (size > 0) out.push({ material, from, to: from + size - 1 });
      budget -= Math.max(0, size);
    };
    for (const n of sorted.slice(1)) {
      if (n - to <= 4) to = n;
      else {
        push();
        from = to = n;
      }
    }
    push();
    if (budget <= 0) break;
  }
  return out;
}

/** Words the model uses when planning to itself, never in an answer to the student. */
export const PLANNING = /\b(the student'?s?\b|I need (?:the|to (?:pull|fetch|get|read|check|look|search|find))|let me (?:pull|fetch|grab|gather|get|check|look|search|read|load|open|find|calculate|compute|work (?:it|this|that) out)|I'?ll (?:pull|fetch|grab|gather|search|look up|load|calculate|compute)\b|I'?ll answer the ones)/i;

const NARRATION_END = /(^|[.!?:]\s+|\]\]\s+|\n+)([^.!?\n[\]]*\b(let me|let's|I'll|I will|I need to|I'm going to|I am going to)\s+(also\s+)?(pull|fetch|grab|gather|get|check|look|search|read|load|open|find|calculate|compute|work|verify)\b[^.!?\n[\]]*[.!?:…]?)\s*$/i;

// The student's name may come first ("Timmy, I'm sorry to say…": owner's live check, 23 Nov 2026).
const APOLOGY_START = /^\s*(?:[\p{L}'-]{2,20},\s*)?((?:i'?m |i am )?sorry\b|apolog|my apologies|(?:you'?re|you are) (?:right|correct)\b[^.!?\n]*\b(my|last|previous|earlier|answer|reply|explanation|response|skimm|missed|skipped)\b)[^.!?\n]*[.!?]+\s*/iu;

/** Drops an opening apology or comment on an earlier answer ("Sorry about that, Leko.", "You're
 *  right, my last explanation skipped the steps."). A quiz verdict ("You're right, it's Planning")
 *  is kept: it says nothing about an earlier answer. */
// "You're right, Leko. My last answer rushed the steps." — the same, over two sentences.
const APOLOGY_TWO = /^\s*(?:you'?re|you are) (?:right|correct)(?:,\s*[\p{L}'-]+)?[.!]\s*(?:my|the|that) (?:last|previous|earlier|first) (?:answer|reply|explanation|response|attempt)[^.!?\n]*[.!?]+\s*/iu;

// "Hey Chineze, the course has no memory-aid slides as such, so I'll…" (owner's review, 22 Nov 2026):
// a comment on what the slides lack, which the thin-slides part of rule 7 forbids. Only "has no / doesn't have any": a
// sentence about what the slides do have is kept, and so is rule 4's "Your slides don't cover this".
const LACKS_START = /^\s*(?:(?:hey|hi|hello|okay|ok|alright|right)\b[^.!?\n,]{0,30}[,!.]\s*)?(?:the|this|your) (?:course|slides|notes|lectures?|materials?|decks?)\b[^.!?\n]{0,40}?\b(?:ha(?:s|ve) no|(?:doesn'?t|does not|don'?t|do not) (?:have|include|contain) (?:any|a|specific|dedicated)|contains? no)\b[^.!?\n]*[.!?]+\s*/iu;

// "Where a topic's slides didn't include a clear definition, I've described it from its title." (owner,
// 23 Nov 2026): a note on method before the answer starts. Only a sentence that opens with "Where/When/If
// a topic's (or the) slides didn't/don't…" and says what was done instead.
const WHERE_LACKS_START = /^\s*(?:where|when|if|for topics where) (?:a|the|some|any) (?:topic|lecture|slide|deck)(?:'s|s'|s)? (?:slides? |notes |materials? )?(?:didn'?t|did not|don'?t|do not|doesn'?t|does not|lacked|lack)\b[^.!?\n]*[.!?]+\s*/iu;

// Rule 4's opening must be the first words (behaviour check, 23 Nov 2026: "Tolu, this is a question the
// course doesn't cover. Kubernetes isn't part of FIN 410… Your slides don't cover this, but here's the
// idea:"). Whatever comes before it in the first lines is a preamble saying the same thing: dropped.
const NOT_COVERED = "Your slides don't cover this, but here's the idea:";

export function trimApologyOpening(text: string): string {
  const at = text.indexOf(NOT_COVERED);
  if (at > 0 && at < 400) return text.slice(at);
  return text.replace(APOLOGY_TWO, "").replace(APOLOGY_START, "").replace(LACKS_START, "").replace(WHERE_LACKS_START, "");
}

/** The student says a test or exam is happening right now (rule 15). Not "my exam is tomorrow" or
 *  "exam period": revision is always fine. */
export function inLiveExam(message: string): boolean {
  return (
    /\b(?:i'?m|i am|we'?re|we are|currently)\s+(?:in|writing|sitting|taking|doing|in the middle of)\s+(?:my|the|an|our|a)\s+(?:exam|test|quiz|paper|cat)\b(?!\s+(?:period|season|week|timetable|prep|preparation|tomorrow|next|soon|later|on|in \d))/i.test(message) ||
    /\b(?:exam|test|quiz)\b[^.!?\n]{0,40}\b(?:right now|is ongoing|is going on|is happening now)\b/i.test(message) ||
    /\b\d+\s*(?:mins?|minutes)\s+(?:left|remaining)\b/i.test(message)
  );
}

// A stray Chinese, Japanese or Korean character in an English answer (owner's review, 22 Nov 2026:
// "Fine 面 to recognise"): a model slip, dropped as the answer streams. A course in one of those
// languages would need this off.
const STRAY_CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]+/g;
export function dropStrayCjk(text: string): string {
  return text.replace(STRAY_CJK, "");
}

// Talk about the search, said about the slides instead (owner's review, 21 Nov 2026: about one answer
// in 20 still said "the search didn't return…" despite the rule). Applied to the held-back end of
// each block, so a phrase is whole when it is rewritten.
const SEARCH_TALK: [RegExp, string][] = [
  [/\b(?:in|from) the (?:materials|slides|results) I (?:searched|found|pulled|looked at)\b/gi, "in your slides"],
  [/\bThe search (?:didn'?t|did not) (?:return|find|turn up|bring up) (?:anything|much)(?: (?:on|about))?/g, "Your slides don't cover"],
  [/\bthe search (?:didn'?t|did not) (?:return|find|turn up|bring up) (?:anything|much)(?: (?:on|about))?/g, "your slides don't cover"],
  [/\b[Tt]he search results\b/g, "your slides"],
  // Whole sentences about the looking (owner's review, 22 Nov 2026): "I searched the slides for press
  // freedom and NBC regulation, and…", "I didn't find slides that deal with…". Dropped.
  [/(?<=^|[.!?]\s+|\n)I (?:searched|looked through|went through|checked|scanned) (?:the|your) (?:course )?(?:slides|materials|notes)\b[^.!?\n]*[.!?]\s*/g, ""],
  [/(?<=^|[.!?]\s+|\n)I (?:didn'?t|did not|couldn'?t|could not) find (?:any )?(?:slides?|materials?|notes|anything)\b[^.!?\n]*[.!?]\s*/g, ""],
  // Thinking aloud (owner's live check, 23 Nov 2026): "Hmm, check that again:" and a bare "Let me
  // calculate it:" line reached the student.
  [/(?<=^|[.!?]\s+|\n)(?:Hmm+|Wait|Actually, wait)[,.]?\s+(?:let me |let's )?(?:check|recheck|re-check|double-check|look at) (?:that|this|it)(?: again)?[:.]\s*/g, ""],
  [/(?<=^|\n)(?:Let me|Let's) (?:calculate|compute|work out|do the (?:maths?|calculation)) (?:it|this|that|them)?\s*[:.]\s*(?=\n|$)/g, ""],
  // "I'll calculate it with the slide's formula." (same check, second run): a sentence announcing the
  // calculation, anywhere a sentence starts.
  [/(?<=^|[.!?]\s+|\n)I(?:'ll| will| am going to|'m going to) (?:now )?(?:calculate|compute|work (?:it|this|that|them) out|do the (?:maths?|calculation))\b[^.!?\n]*[.!?:][ \t]*/g, ""],
];
/** "My upload", "the PDF I uploaded", "my test", "my notes": the student means their own pages. */
const MENTIONS_UPLOAD = /\b(upload(?:ed|s)?|my (?:test|notes?|paper|pdf|file|document|scan|worksheet|pages?)|the (?:pdf|file|document|scan) I)\b/i;
const UPLOAD_TEXT_MAX = 24000; // characters of an upload handed to the model (a 20-page PDF fits)

/** "Answer these", "question by question", "ILAC": photos of a paper to work through. */
const PAPER_WORDS = /\b(answer (?:these|them|all|each|every|the questions?)|question by question|each question|all (?:the )?questions|past (?:paper|questions?)|test questions?|exam questions?|ILAC|IRAC|IPAC)\b/i;

/** "Give me memory aids", "mnemonics for each topic", "help me remember the definitions". */
export function asksForMemoryAids(message: string): boolean {
  return /\b(memory (aids?|tricks?|hooks?|devices?)|mnemonics?|acronyms?|help me (remember|memori[sz]e)|(easy|easier) to remember|ways? to remember)\b/i.test(message);
}

/** "Draw…", "plot…", "explain it graphically", "a flowchart of…": the student wants a picture. */
export function asksToDraw(message: string): boolean {
  return /\b(draw|drawing|plot|sketch|graph(s|ically|ical)?|chart|flow ?chart|visual(ly|i[sz]e)?|illustrate)\b/i.test(message);
}

export function plainSlideTalk(text: string): string {
  let out = dropStrayCjk(text);
  for (const [re, by] of SEARCH_TALK) out = out.replace(re, by);
  return out;
}

/** Drops a closing "…let me pull the slides too." from text written just before a tool call. */
export function trimTrailingNarration(text: string): { text: string; dropped: string | null } {
  const m = text.match(NARRATION_END);
  if (!m) return { text, dropped: null };
  return { text: text.slice(0, m.index! + m[1].length).replace(/\s+$/, ""), dropped: m[2].trim() };
}

/** The text of the latest assistant answer in the history. */
function lastAnswer(history: ModelMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant" && typeof m.content === "string") return m.content;
  }
  return "";
}

/** Reads covering a page range of materials, at most 40 pages per call and WALKTHROUGH_PAGES in all. */
function pageReads(courseCode: string, mats: { material_order: number; from: number; pages: number }[]) {
  const out: { material: string; from: number; to: number }[] = [];
  let budget = WALKTHROUGH_PAGES;
  for (const m of mats) {
    for (let from = m.from; from <= m.pages && budget > 0; from += 40) {
      const to = Math.min(m.pages, from + 39, from + budget - 1);
      out.push({ material: materialKey(courseCode, m.material_order), from, to });
      budget -= to - from + 1;
    }
  }
  return out;
}

export async function runChatTurn(turn: ChatTurn) {
  const db = adminClient();
  const ctx: AgentContext = newContext({
    db,
    courseId: turn.courseId,
    userId: turn.userId,
    courseCode: turn.courseCode,
    courseTitle: turn.courseTitle,
    topicId: turn.topicId,
    topicTitle: turn.topicTitle,
    calculationHeavy: !!turn.calculationHeavy,
    abortSignal: turn.abortSignal,
  });

  const cited = new Map<string, Citation>();
  const invalid: string[] = [];
  const errors: { code: string; detail: string }[] = [];
  let output = "";
  let firstTextAt: number | null = null;
  const summaryAsked = SUMMARY_WORDS.test(turn.userMessage);

  // Validates [[s:…]] markers in every text block before anything reaches the student.
  const citationTransform = () => {
    const filters = new Map<string, ReturnType<typeof createCitationFilter>>();
    const filterFor = (id: string) => {
      let f = filters.get(id);
      if (!f) {
        f = createCitationFilter({
          isAllowed: (k) => ctx.retrieved.has(k),
          // A loaded slide that clearly says nothing of the sentence is dropped (support.ts).
          supports: (k, claim) => supportsClaim(claim, ctx.slideText.get(k)).ok,
          onUnsupported: (k) => errors.push({ code: "citation_unsupported", detail: k }),
          onCited: (k) => cited.set(k, ctx.retrieved.get(k)!),
          onInvalid: (k) => {
            invalid.push(k);
            errors.push({ code: "citation_invalid", detail: k });
          },
        });
        filters.set(id, f);
      }
      return f;
    };
    const emit = (controller: TransformStreamDefaultController<TextStreamPart<ToolSet>>, id: string, text: string) => {
      if (!text) return;
      firstTextAt ??= Date.now();
      output += text;
      controller.enqueue({ type: "text-delta", id, text } as TextStreamPart<ToolSet>);
    };
    // Text blocks from different steps (before and after a tool call) arrive back to back;
    // start each new block on a new paragraph instead of gluing "…this.Your…" together.
    const needsBreak = new Set<string>();
    // Narration guard: the model sometimes writes a sentence before calling a tool ("To summarize
    // properly, I'll pull all its pages."). Each text block is held back whole (start, text, end)
    // until it is clearly an answer (longer than NARRATION_MAX) or its step ends. If a tool call
    // starts first, the block was narration and is dropped (logged as narration_dropped).
    // Costs at most the time to generate ~240 characters before the first word (narration like "I need
    // the main slides for each topic… I'll pull the Deployment, Frontend and Backend slides." runs ~130).
    const NARRATION_MAX = 240;
    // Planning that runs longer (owner's review, 22 Nov 2026: "I need the course materials for the exam
    // questions. The student's photos cover several questions, so I'll answer the ones I can ground…
    // Let me pull…", ~290 characters, reached the student): a block that reads like the model talking
    // to itself is held up to NARRATION_HARD_MAX before it counts as an answer.
    const NARRATION_HARD_MAX = 600;
    type Held = { start: TextStreamPart<ToolSet>; raw: string; end?: TextStreamPart<ToolSet> };
    const held = new Map<string, Held>();
    type Ctrl = TransformStreamDefaultController<TextStreamPart<ToolSet>>;
    // Trailing narration: a block that is clearly an answer can still end with "…let me pull the
    // slides too." just before a tool call (owner's answer review, 21 Nov 2026). The last TAIL
    // characters of each streaming block wait until we know what follows: a tool call drops a
    // closing narration sentence; anything else sends them on unchanged.
    const TAIL = 200;
    type Tail = { text: string; end?: TextStreamPart<ToolSet> };
    const tails = new Map<string, Tail>();
    const toTail = (controller: Ctrl, id: string, text: string) => {
      if (!text) return;
      const t = tails.get(id) ?? { text: "" };
      t.text = plainSlideTalk(t.text + text);
      tails.set(id, t);
      if (t.text.length > TAIL) {
        emit(controller, id, t.text.slice(0, -TAIL));
        t.text = t.text.slice(-TAIL);
      }
    };
    const flushTail = (controller: Ctrl, id: string, beforeTool: boolean) => {
      const t = tails.get(id);
      if (!t) return;
      tails.delete(id);
      let text = t.text;
      if (beforeTool) {
        const cut = trimTrailingNarration(text);
        if (cut.dropped) {
          errors.push({ code: "narration_dropped", detail: cut.dropped.slice(0, 200) });
          text = cut.text;
        }
      }
      emit(controller, id, text);
      if (t.end) controller.enqueue(t.end);
    };
    const flushTails = (controller: Ctrl, beforeTool: boolean) => {
      for (const id of [...tails.keys()]) flushTail(controller, id, beforeTool);
    };
    const streamText_ = (controller: Ctrl, id: string, raw: string) => {
      let text = filterFor(id).push(raw);
      if (text && needsBreak.delete(id)) text = `\n\n${text.replace(/^\s+/, "")}`;
      toTail(controller, id, text);
    };
    const release = (controller: Ctrl, id: string) => {
      const h = held.get(id);
      if (!h) return;
      held.delete(id);
      controller.enqueue(h.start);
      // The answer's first words: no apology or comment on an earlier answer (rule 14).
      streamText_(controller, id, output.trim() ? h.raw : trimApologyOpening(h.raw));
      if (h.end) {
        toTail(controller, id, filterFor(id).flush());
        const t = tails.get(id);
        if (t) t.end = h.end;
        else controller.enqueue(h.end);
      }
    };
    return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(part, controller) {
        switch (part.type) {
          case "text-start":
            flushTails(controller, false);
            if (output.trim() && !output.endsWith("\n")) needsBreak.add(part.id);
            held.set(part.id, { start: part, raw: "" });
            return;
          case "text-delta": {
            const h = held.get(part.id);
            if (h) {
              h.raw += part.text;
              if (h.raw.length > NARRATION_HARD_MAX || (h.raw.length > NARRATION_MAX && !PLANNING.test(h.raw))) release(controller, part.id);
              return;
            }
            streamText_(controller, part.id, part.text);
            return;
          }
          case "text-end": {
            const h = held.get(part.id);
            if (h) {
              h.end = part; // decide when the step ends or a tool call starts
              return;
            }
            toTail(controller, part.id, filterFor(part.id).flush());
            {
              const t = tails.get(part.id);
              if (t) {
                t.end = part; // sent with the tail, once we know whether a tool call follows
                return;
              }
            }
            break;
          }
          case "tool-input-start":
          case "tool-call":
            flushTails(controller, true);
            for (const [id, h] of held) {
              if (h.raw.trim()) errors.push({ code: "narration_dropped", detail: h.raw.trim().slice(0, 200) });
              held.delete(id);
              needsBreak.delete(id);
            }
            break;
          case "finish-step":
          case "finish":
            for (const id of [...held.keys()]) release(controller, id);
            flushTails(controller, false);
            break;
        }
        controller.enqueue(part);
      },
      // An aborted or failed stream: whatever is still held back goes out.
      flush(controller) {
        flushTails(controller, false);
      },
    });
  };

  // Retrieval before every answer (PRD §15 check 1), done by the server: the first search runs
  // before the model is called and is handed to it as its own search_slides call. This
  // guarantees grounding (prompting alone didn't: the model sometimes answered from memory) and
  // saves a whole model round trip before the first word (PRD: p95 time to first token <= 3 s).
  // The model can still search again, list topics or read whole materials.
  // Material that isn't lecture content ("other": student presentations, briefs, templates) is
  // searched only when the student asks for it (PRD F3, F11); the prompt decides how it's used.
  // A question asked from the viewer is about one exact item: the server reads that item first
  // (titles can repeat, so a search could pick another one). Otherwise it searches.
  // "Explain the code in this topic": every practical file (scripts, notebooks) of the topic or
  // course is read first, so the answer covers each file, not just the best search matches.
  const focus = turn.focusSlide ? parseSlideKey(turn.focusSlide) : null;
  const preCalls: { tool: typeof searchSlides | typeof getMaterialPages | typeof listTopics; input: Record<string, unknown> }[] = [];
  if (focus) {
    preCalls.push({ tool: getMaterialPages, input: { material: focus.material, from: focus.number, to: focus.number } });
  } else if (asksForCodeOverview(turn.userMessage)) {
    for (const m of await practicalMaterials(db, turn.courseId, turn.topicId)) {
      preCalls.push({ tool: getMaterialPages, input: { material: materialKey(turn.courseCode, m.material_order), from: 1, to: m.pages } });
    }
  }
  // "Explain every slide": read the topic's lecture files in full first (not when the student names
  // another week or lecture: the model finds that one with list_topics).
  const walkthrough = asksForWalkthrough(turn.userMessage);
  const namesOtherPart = /\b(week|lecture|wk|class)\s*0?\d+/i.test(turn.userMessage);
  if (!preCalls.length && walkthrough && turn.topicId && !namesOtherPart) {
    const mats = must(
      await db.from("materials").select("material_order, page_count").eq("course_id", turn.courseId).eq("topic_id", turn.topicId).in("kind", ["slides", "notes"]).order("material_order"),
    ) as { material_order: number; page_count: number }[];
    for (const r of pageReads(turn.courseCode, mats.map((m) => ({ material_order: m.material_order, from: 1, pages: m.page_count })))) {
      preCalls.push({ tool: getMaterialPages, input: r });
    }
  }
  // "Week 7" / "lecture 3" (owner's review, 21 Nov 2026: asked about week 7, the model taught week
  // 2's three-part test): find the file by its name, read it all, and say which one it is.
  const part = namedPart(turn.userMessage);
  let partNote: string | null = null;
  if (!preCalls.length && part) {
    const mats = must(
      await db.from("materials").select("material_order, page_count, title, source_file, kind").eq("course_id", turn.courseId).in("kind", ["slides", "notes"]).order("material_order"),
    ) as { material_order: number; page_count: number; title: string; source_file: string | null; kind: string }[];
    const named = (kind: "week" | "lecture") => mats.filter((m) => matchesPart(m.title, part, kind) || matchesPart(m.source_file?.split("/").pop() ?? "", part, kind));
    let found = named(part.kind);
    if (!found.length) found = named(part.kind === "week" ? "lecture" : "week");
    if (found.length && found.length <= 3) {
      for (const r of pageReads(turn.courseCode, found.map((m) => ({ material_order: m.material_order, from: 1, pages: m.page_count })))) preCalls.push({ tool: getMaterialPages, input: r });
      partNote = `The student means ${part.kind} ${part.n}: ${found.map((m) => `"${m.title}" (${materialKey(turn.courseCode, m.material_order)})`).join(", ")}. Its pages are given to you above: teach from them, and don't use another week's material for this unless they ask.`;
    } else {
      partNote = `No file in this course is named ${part.kind} ${part.n}. Use list_topics (lms_section often holds the week's dates) to find it; if more than one could fit, ask which one instead of guessing.`;
    }
  }
  // A whole-course walkthrough ("all the notes from initiation to risk", "every slide of week 3") or
  // overview: the course's topic list first, so the model reads the right decks, middle ones included.
  // Memory aids on Whole course (owner, 22 Nov 2026): topic by topic, so the topic list first too.
  const memoryAids = asksForMemoryAids(turn.userMessage);
  if (!preCalls.length && (walkthrough || ((summaryAsked || memoryAids) && !turn.topicId)) && (!turn.topicId || namesOtherPart)) {
    preCalls.push({ tool: listTopics, input: {} });
    // Memory aids for the whole course: each topic's key slides found up front, so every point has a
    // slide to cite (one answer cited 8 slides it had never opened, and they were dropped).
    if (memoryAids && !walkthrough) {
      const topics = must(await db.from("topics").select("title").eq("course_id", turn.courseId).order("topic_order").limit(MEMORY_AID_TOPICS)) as { title: string }[];
      for (const t of topics) preCalls.push({ tool: searchSlides, input: { query: `${t.title}: definition, meaning, types and key points`, k: 4 } });
    }
  }
  // "Keep going": pick up after the last slide the previous answer cited, with those slides read
  // (searching for the words "keep going" found nothing and lost the place).
  const previous = lastAnswer(turn.history);
  const continuing = !preCalls.length && isContinuation(turn.userMessage) && !!previous;
  // "5" or "b" after a list: the item picked (searched for, and named to the model below).
  const picked = previous ? pickedItem(turn.userMessage, previous) : null;
  let resumeNote: string | null = null;
  if (continuing) {
    const at = lastCitedSlide(previous);
    const order = at ? Number(at.material.split("-").pop()) : NaN;
    if (at && Number.isFinite(order)) {
      const mats = must(
        await db.from("materials").select("material_order, page_count, topic_id, kind").eq("course_id", turn.courseId).order("material_order"),
      ) as { material_order: number; page_count: number; topic_id: string | null; kind: string }[];
      const here = mats.find((m) => m.material_order === order);
      if (here) {
        // The rest of this file, then the topic's later lecture files.
        const later = mats.filter((m) => m.material_order > order && m.topic_id && m.topic_id === here.topic_id && (m.kind === "slides" || m.kind === "notes"));
        const reads = pageReads(turn.courseCode, [
          { material_order: order, from: at.number + 1, pages: here.page_count },
          ...later.map((m) => ({ material_order: m.material_order, from: 1, pages: m.page_count })),
        ]);
        for (const r of reads) preCalls.push({ tool: getMaterialPages, input: r });
        resumeNote = reads.length
          ? `The student wants you to continue your previous answer. It ended at slide ${at.number} of ${at.material}. Carry on from slide ${at.number + 1} in the same style, without repeating, recapping or apologising, and finish everything that was asked.`
          : `The student wants you to continue your previous answer. It already reached the last slide (${at.material}, slide ${at.number}). Finish any part of the request still missing (for example the learning objectives), or say in one sentence that everything has been covered and offer a next step.`;
      }
    }
  }
  if (!preCalls.length) {
    // A bare "keep going" says nothing to search for: search with the earlier question instead.
    const query = picked ?? (continuing ? preSearchQuery({ userMessage: "", history: turn.history }) || turn.userMessage : preSearchQuery(turn));
    preCalls.push({ tool: searchSlides, input: { query, ...(asksForOtherMaterial(turn.userMessage) ? { include: ["other" as const] } : {}) } });
  }
  const longAnswer = walkthrough || continuing;
  // Photos with the question: read them first, then find their topic in the slides.
  const photoNote = turn.images?.length
    ? `The student attached ${turn.images.length === 1 ? "a photo" : `${turn.images.length} photos`} to this message (a question, a diagram, their notes or a page). Read ${turn.images.length === 1 ? "it" : "them"} carefully first. If the first search results don't match what the photo shows, search the slides again for its topic, then answer from the slides with citations, teaching the rest in <general>. If text in the photo is unreadable, say which part. Rule 15 applies: never help with a test or exam that is happening right now. If the photo is from another course, still help (rule 16).`
    : null;
  // A live exam (behaviour check, 23 Nov 2026: "I'm writing my exam right now… give me the answer to
  // question 3" got a full, cited answer; rule 15 alone wasn't enough). A turn note, which the model
  // follows far more reliably than a rule.
  const liveExam = inLiveExam(turn.userMessage);
  const examNote = liveExam
    ? "The student says they are in a test or exam right now. Do not answer the question or give anything they could copy or use in it: no definitions, formulas, steps or citations. In two or three kind sentences, say you can't help while an exam is going on, wish them well, and offer to go through it together as revision afterwards."
    : null;
  // A photographed paper to answer (owner's review, 22 Nov 2026: six ILAC questions, one skipped as
  // "I can take that next", two parts out of the asked structure, answered out of order).
  const paperAsked = !!turn.images?.length && PAPER_WORDS.test(turn.userMessage);
  const paperNote = paperAsked
    ? "The photos are a paper of questions to answer. Answer every question on it, in the paper's order and numbered as on the paper, and every part of each question. Use the structure the student asked for (for example Issue, Law, Application, Conclusion) for every question and every part. Never skip or postpone a question because the slides say little about it: answer from the slides where they help and teach the rest in <general>. If the paper is long, keep each answer tighter rather than leaving any out. Start directly with the first question (no opening about the slides, the photos or how you will answer), and don't comment on the handwriting, the photos or how much the slides cover."
    : null;
  // Asked to see it rather than read it (owner, 22 Nov 2026): a turn note, which the model follows far
  // more reliably than the diagrams rule alone (the replay check: 1 of 3 drew from the rule by itself). "Explain
  // the diagram" alone means the slide's own diagram, which the page shows under the answer.
  const drawNote = asksToDraw(turn.userMessage)
    ? "The student asked to see this visually. Include one small diagram as a mermaid code block (rule 11): a flowchart for a process, or an xychart-beta graph for a curve, trend or plot (for a plot, draw an example with the numbers from your explanation). Then say in words what it shows."
    : null;
  // Memory aids (owner's review, 22 Nov 2026): one answer gave aids for five random lists instead of each
  // topic, with acronyms whose letters didn't match; an earlier one cited 16 slides it never opened.
  const memoryNote = memoryAids
    ? `The student wants memory aids. ${turn.topicId ? "Cover this lecture's key definitions and lists." : "Go topic by topic, in the order of the topic list, and cover every topic; each topic's key slides were searched for you above."} For each topic: a bold heading; the key definition or list in a line or two, cited, using only slide keys that appear in the results above (a point without such a slide gets no citation); then one memory aid inside <general>. For a list, prefer a sentence with one word per item, each word starting with that item's first letter, in the same order ("My Dear Wise Cat Thinks" for Modernisation, Dependency, World-systems, Cultural imperialism, Technological determinism); for an idea, a vivid picture or comparison. Check the letters and their order silently before writing; never print the check, and never call an aid awkward: if no sentence fits, use a picture instead. Name only what you then give. Keep each topic short, about four lines. Start straight with the first topic's heading: no note on how you handled thin slides.`
    : null;
  // Maths in a calculator course (owner's answer review, 21 Nov 2026): with thinking off, Haiku
  // rushed worked examples (a wrong binomial coefficient, a slide's wrong angle repeated) and
  // skipped the calculator. A short think at low effort; thinking tokens count against the cap.
  const thinkMaths = !!turn.calculationHeavy && !longAnswer && asksForWorking(turn.userMessage);
  // The previous answer asked a question and this is a short reply: it is the student's answer.
  // Short replies only: a longer message is the student saying something new, not an answer
  // (the model once "marked" a remark about real-life examples as a quiz answer).
  const answering = !!previous && !continuing && !walkthrough && endsWithQuestion(previous) && turn.userMessage.trim().split(/\s+/).length <= 12;
  const answerNote = picked
    ? `The student's message "${turn.userMessage.trim()}" picks item ${turn.userMessage.trim()} of your previous message: "${picked}". If that was a quiz question's options, mark their choice; otherwise act on that item directly, with no remark about their reply.`
    : answering
    ? `Your previous message ended with this question to the student: "${lastQuestion(previous!) ?? ""}". Their new message may be their answer to it. If it answers your question, mark it first (right, partly right or wrong, and why, citing the slide with the answer), then continue. If you had offered something ("Want me to…?"), a yes means do it now. If it doesn't answer the question, respond to what they actually said, and never say or imply that they answered.`
    : null;
  // Follow-ups ("5", "b", a quiz answer, "explain that again"): the slides the previous answer
  // cited are read again, so the model can check the student's answer against them and its
  // citations stay valid (they used to be stripped as citation_invalid, and the model said it
  // "couldn't confirm" a figure it had cited one turn earlier). Owner's review, 21 Nov 2026.
  if (previous && !continuing && !walkthrough && !focus) {
    for (const r of citedRanges(previous)) preCalls.push({ tool: getMaterialPages, input: r });
  }
  const pre = [];
  for (const [i, c] of preCalls.entries()) {
    pre.push({ id: `presearch_${turn.assistantMessageId}_${i}`, name: c.tool.name, input: c.input, output: await c.tool.run(ctx, c.input as never) });
  }
  // Slide images, only where they help (owner, 23 Nov 2026, option B; slide-images.ts): the slide asked
  // about from the viewer; the top results of a question about a diagram, graph or chart; or top
  // results that are mostly picture. Not for long reads (walkthroughs, summaries, memory aids, papers):
  // too many slides. The model can still call view_slides itself.
  if (!longAnswer && !summaryAsked && !memoryAids && !paperAsked) {
    const found = ctx.toolLog.find((t) => t.name === "search_slides")?.slide_keys ?? [];
    const look = focus && turn.focusSlide
      ? [turn.focusSlide]
      : ASKS_VISUAL.test(turn.userMessage)
        ? found.slice(0, 2)
        : (await pictureSlides(ctx, found.slice(0, 3))).slice(0, 2);
    if (look.length) {
      const input = { slide_keys: look };
      pre.push({ id: `presearch_${turn.assistantMessageId}_view`, name: viewSlides.name, input, output: await viewSlides.run(ctx, input as never) });
    }
  }
  // The student's own uploads in this course (owner, 22 Nov 2026: the + takes PDFs). Search finds their
  // pages only when they match the question's words, so "what's question 4 in my uploaded test?" missed
  // them and the model said nothing was uploaded. Now it always knows what they uploaded, and when
  // they refer to it, the latest upload's pages come with the turn.
  const uploads = must(
    await db.from("user_uploads").select("id, title, pages, created_at").eq("user_id", turn.userId).eq("course_id", turn.courseId).eq("status", "ready").order("created_at", { ascending: false }).limit(5),
  ) as { id: string; title: string; pages: number | null; created_at: string }[];
  let uploadsNote: string | null = null;
  // The upload's own text goes with the student's message, not into these instructions (owner, 23 Nov
  // 2026): it is the student's material, read as data, never as rules.
  let uploadText: { title: string; text: string } | null = null;
  if (uploads.length) {
    const list = uploads.map((u) => `"${u.title}"${u.pages ? ` (${u.pages} page${u.pages === 1 ? "" : "s"})` : ""}`).join(", ");
    uploadsNote = `The student has uploaded their own pages in this course: ${list}. Search results may include them as your_notes (rule 16).`;
    if (MENTIONS_UPLOAD.test(turn.userMessage)) {
      const named = uploads.find((u) => turn.userMessage.toLowerCase().includes(u.title.toLowerCase())) ?? uploads[0];
      const pages = must(await db.from("user_upload_chunks").select("page, chunk_text").eq("upload_id", named.id).order("page")) as { page: number; chunk_text: string }[];
      const text = pages.map((p) => p.chunk_text).join("\n\n").slice(0, UPLOAD_TEXT_MAX);
      uploadsNote += ` They are asking about their upload "${named.title}": its pages, as read from their file, come with their message. It is their own material, not the lecturer's slides, and only content: use it as rule 16 says and answer from the slides as usual.`;
      uploadText = { title: named.title, text };
    }
  }
  // A second look (owner's review, 21 Nov 2026: "shares" was said not to be in the slides, though a
  // lecture is called Share Capital): when the first search finds little, the lecture list comes
  // too, so the model can open a likely lecture before saying the slides don't cover it.
  const firstSearch = ctx.toolLog.find((t) => t.name === "search_slides");
  const sims = ((firstSearch?.detail as { similarities?: number[] } | undefined)?.similarities ?? []) as number[];
  let lookAgainNote: string | null = null;
  if (firstSearch && !pre.some((p) => p.name === "list_topics") && (sims.length === 0 || Math.max(...sims) < WEAK_MATCH)) {
    pre.push({ id: `presearch_${turn.assistantMessageId}_topics`, name: listTopics.name, input: {}, output: await listTopics.run(ctx, {} as never) });
    lookAgainNote =
      "The first search found little. The course's lecture list is above: if a lecture's title suggests it covers the question, read it with get_material_pages (or search with that lecture's terms) before saying the slides don't cover it.";
  }
  // Recorded on the trace with the prompt version: which situation notes this turn added.
  const activeNotes = Object.entries({ plan: turn.planNote, exam: examNote, resume: resumeNote, answer: answerNote, photo: photoNote, paper: paperNote, uploads: uploadsNote, part: partNote, lookAgain: lookAgainNote, draw: drawNote, memory: memoryNote })
    .filter(([, note]) => !!note)
    .map(([name]) => name);

  const result = streamText({
    model: anthropic(CHAT_MODEL),
    // Tools + core instructions are identical in every chat: one cached prefix shared by all
    // students (Haiku 5.5 caches from 512 tokens). The chat-specific line comes after it.
    instructions: [
      { role: "system", content: CORE_INSTRUCTIONS, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "system", content: [chatContext(turn), turn.planNote, partnerContext(turn.partnerVoice ?? null, turn.studentName ?? null), examNote, resumeNote, answerNote, photoNote, paperNote, uploadsNote, partNote, lookAgainNote, drawNote, memoryNote, TURN_REMINDER].filter(Boolean).join("\n\n") },
    ],
    messages: [
      ...turn.history,
      // Cache breakpoint: every later step of this turn resends everything up to here.
      {
        role: "user",
        content:
          turn.images?.length || uploadText
            ? [
                ...(uploadText ? [{ type: "text" as const, text: `[The student's upload "${uploadText.title}", as read from their file]\n${uploadText.text}\n[End of upload]` }] : []),
                { type: "text" as const, text: turn.userMessage },
                ...(turn.images ?? []).map((image) => ({ type: "image" as const, image })),
              ]
            : turn.userMessage,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      { role: "assistant", content: pre.map((c) => ({ type: "tool-call" as const, toolCallId: c.id, toolName: c.name, input: c.input })) },
      {
        role: "tool",
        content: pre.map((c) => ({
          type: "tool-result" as const,
          toolCallId: c.id,
          toolName: c.name,
          output: c.name === viewSlides.name ? viewSlides.modelOutput!(c.output) : { type: "json" as const, value: c.output as never },
        })),
      },
    ],
    tools: buildTools(ctx),
    stopWhen: isStepCount(turn.calculationHeavy ? MAX_STEPS_CALCULATION : paperAsked ? MAX_STEPS_PAPER : MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    prepareStep: () =>
      longAnswer || thinkMaths
        ? { maxOutputTokens: longAnswer ? MAX_OUTPUT_TOKENS_WALKTHROUGH : MAX_OUTPUT_TOKENS_SUMMARY + 8000 }
        : ctx.readMaterial || summaryAsked || memoryAids || paperAsked
          ? { maxOutputTokens: MAX_OUTPUT_TOKENS_SUMMARY }
          : {},
    providerOptions: {
      // Grounded answers from retrieved slides: thinking adds latency before the first word
      // (PRD target: p95 time to first token <= 3 s). Allowed on Haiku 5.5 at effort <= high.
      anthropic: thinkMaths ? { thinking: { type: "adaptive" }, effort: "low" } : { thinking: { type: "disabled" } },
    },
    abortSignal: turn.abortSignal,
    experimental_transform: citationTransform,
    onError: ({ error }) => {
      errors.push({ code: "model_error", detail: error instanceof Error ? error.message : String(error) });
    },
    onEnd: async (event) => {
      // Ran out of room: logged, and the student sees "cut short" with a Continue button.
      if (event.finishReason === "length") errors.push({ code: "truncated", detail: `stopped at the output limit (${event.usage.outputTokens ?? "?"} tokens)` });
      await finishTurn(event.usage).catch((e) => console.error("finishTurn failed", e));
    },
  });

  async function finishTurn(usage: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number; noCacheTokens?: number };
  }) {
    for (const t of ctx.toolLog) if (t.status === "failed") errors.push({ code: "tool_failed", detail: `${t.name}: ${t.error}` });
    const citations = [...cited.values()];
    let messageId: string | null = null;
    // Superseded: the student edited this question (or an earlier one) while the answer was still
    // finishing in the background. Saving it would put an orphan answer back into the chat.
    const superseded =
      !!turn.userMessageId &&
      !(await db.from("messages").select("id").eq("id", turn.userMessageId).maybeSingle()).data;
    if (superseded) {
      errors.push({ code: "superseded", detail: "question was edited before the answer finished; answer not saved" });
    } else if (output.trim()) {
      must(
        await db.from("messages").insert({
          id: turn.assistantMessageId,
          conversation_id: turn.conversationId,
          user_id: turn.userId,
          role: "assistant",
          content: output,
          citations,
        }),
      );
      messageId = turn.assistantMessageId;
      await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", turn.conversationId);
    } else {
      // Nothing reached the student: don't charge them for it.
      if (turn.refund) await turn.refund();
      else await db.rpc("refund_message", { p_user_id: turn.userId });
      errors.push({ code: "empty_answer", detail: "no text produced; message refunded" });
    }

    const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
    const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
    const uncached = usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite);
    const cost =
      (uncached * USD_PER_MTOK.input + cacheRead * USD_PER_MTOK.cacheRead + cacheWrite * USD_PER_MTOK.cacheWrite +
        (usage.outputTokens ?? 0) * USD_PER_MTOK.output) / 1e6;

    const traceRow = {
        message_id: messageId,
        conversation_id: turn.conversationId,
        course_id: turn.courseId,
        user_id: turn.userId,
        user_message: turn.userMessage,
        history_length: turn.history.length,
        tool_calls: ctx.toolLog,
        retrieved_slide_ids: [...ctx.retrieved.keys()],
        output_text: output,
        citations,
        invalid_citations: invalid,
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        cache_read_tokens: cacheRead,
        cache_write_tokens: cacheWrite,
        cost_usd: Number(cost.toFixed(6)),
        model: CHAT_MODEL,
        latency_ms: Date.now() - turn.startedAt,
        ttft_ms: firstTextAt ? firstTextAt - turn.startedAt : null,
        errors,
    };
    // Which prompt produced this answer, and which situation notes were added (prompt-version.ts).
    // Saved without them until the columns exist (migration 20261123000002), so no trace is lost.
    let saved = await db.from("traces").insert({ ...traceRow, prompt_version: PROMPT_VERSION, prompt_notes: activeNotes });
    if (saved.error?.code === "42703" || saved.error?.code === "PGRST204") saved = await db.from("traces").insert(traceRow);
    must(saved);
  }

  const summary = (): TurnSummary => ({
    citations: [...cited.values()],
    fallback: turn.topicTitle ? { topic: turn.topicTitle, used: [...cited.values()].some((c) => c.outside_topic) } : null,
  });

  return { result, summary };
}
