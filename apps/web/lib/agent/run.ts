import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { createCitationFilter } from "./citations";
import { supportsClaim } from "./support";
import { CORE_INSTRUCTIONS, TURN_REMINDER, chatContext, partnerContext } from "./prompt";
import { buildTools, getMaterialPages, listTopics, materialKey, newContext, searchSlides, type AgentContext, type Citation } from "./tools";
import { adminClient, must } from "@/lib/supabase/admin";
import { parseSlideKey } from "@/lib/study/course-code";

export const CHAT_MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
export const HISTORY_LIMIT = 12; // PRD §10.6
const MAX_STEPS = 6; // a search, a follow-up search or reads, and the answer
const MAX_STEPS_CALCULATION = 10; // plus calculate (sometimes twice, after a fix) and optimize
const MAX_OUTPUT_TOKENS = 2000; // room to teach, not just restate the slides
const MAX_OUTPUT_TOKENS_SUMMARY = 6000; // once the agent has read whole materials (3000 cut overviews short)
// "Explain every slide" (owner, 21 Nov 2026, after a student's 35-slide walkthroughs stopped at slide
// ~19 four times in a row): the whole deck in one answer. ~32K tokens is ~24K words, a full deck in
// depth; Haiku writes it in about 3 minutes (the route allows 5). It only costs what is written.
const MAX_OUTPUT_TOKENS_WALKTHROUGH = 32000;
const WALKTHROUGH_PAGES = 120; // pages read before a walkthrough (40 per call)
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

/** "Explain every slide", "slide by slide", "all the slides in detail", "explain the whole deck". */
export function asksForWalkthrough(message: string): boolean {
  return (
    /\b(every|each|all(\s+of)?(\s+the)?|all\s+\d+)\s+(single\s+)?(slides?|pages?|notes?|lectures?|decks?)\b/i.test(message) ||
    /\b(slide|page)[\s-]+by[\s-]+(slide|page)\b/i.test(message) ||
    /\b(explain|teach|go through|break down)\b.{0,40}\b(whole|entire|full|complete)\s+(deck|lecture|slides?|topic|week|note|notes)\b/i.test(message)
  );
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

const NARRATION_END = /(^|[.!?:]\s+|\]\]\s+|\n+)([^.!?\n[\]]*\b(let me|let's|I'll|I will|I need to|I'm going to|I am going to)\s+(also\s+)?(pull|fetch|grab|gather|get|check|look|search|read|load|open|find)\b[^.!?\n[\]]*[.!?:…]?)\s*$/i;

const APOLOGY_START = /^\s*((?:i'?m |i am )?sorry\b|apolog|my apologies|(?:you'?re|you are) (?:right|correct)\b[^.!?\n]*\b(my|last|previous|earlier|answer|reply|explanation|response|skimm|missed|skipped)\b)[^.!?\n]*[.!?]+\s*/i;

/** Drops an opening apology or comment on an earlier answer ("Sorry about that, Leko.", "You're
 *  right, my last explanation skipped the steps."). A quiz verdict ("You're right, it's Planning")
 *  is kept: it says nothing about an earlier answer. */
// "You're right, Leko. My last answer rushed the steps." — the same, over two sentences.
const APOLOGY_TWO = /^\s*(?:you'?re|you are) (?:right|correct)(?:,\s*[\p{L}'-]+)?[.!]\s*(?:my|the|that) (?:last|previous|earlier|first) (?:answer|reply|explanation|response|attempt)[^.!?\n]*[.!?]+\s*/iu;

export function trimApologyOpening(text: string): string {
  return text.replace(APOLOGY_TWO, "").replace(APOLOGY_START, "");
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
      t.text += text;
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
      // The answer's first words: no apology or comment on an earlier answer (rule 19).
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
              if (h.raw.length > NARRATION_MAX) release(controller, part.id);
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
  // A whole-course walkthrough ("all the notes from initiation to risk", "every slide of week 3") or
  // overview: the course's topic list first, so the model reads the right decks, middle ones included.
  if (!preCalls.length && (walkthrough || (summaryAsked && !turn.topicId)) && (!turn.topicId || namesOtherPart)) {
    preCalls.push({ tool: listTopics, input: {} });
  }
  // "Keep going": pick up after the last slide the previous answer cited, with those slides read
  // (searching for the words "keep going" found nothing and lost the place).
  const previous = lastAnswer(turn.history);
  const continuing = !preCalls.length && isContinuation(turn.userMessage) && !!previous;
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
    const query = continuing ? preSearchQuery({ userMessage: "", history: turn.history }) || turn.userMessage : preSearchQuery(turn);
    preCalls.push({ tool: searchSlides, input: { query, ...(asksForOtherMaterial(turn.userMessage) ? { include: ["other" as const] } : {}) } });
  }
  const longAnswer = walkthrough || continuing;
  // The previous answer asked a question and this is a short reply: it is the student's answer.
  const answering = !!previous && !continuing && !walkthrough && endsWithQuestion(previous) && turn.userMessage.trim().length <= 160;
  const picked = previous ? pickedItem(turn.userMessage, previous) : null;
  const answerNote = picked
    ? `The student's message "${turn.userMessage.trim()}" picks item ${turn.userMessage.trim()} of your previous message: "${picked}". If that was a quiz question's options, mark their choice; otherwise act on that item directly, with no remark about their reply.`
    : answering
    ? `Your previous message ended with a question to the student, and this message is most likely their reply to it. If you had asked a quiz or check question, this is their answer: mark it first (right, partly right or wrong, and why, citing the slide with the answer), then continue. If you had offered something ("Want me to…?"), a yes means do it now. Only if the message clearly asks something new, answer that instead.`
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

  const result = streamText({
    model: anthropic(CHAT_MODEL),
    // Tools + core instructions are identical in every chat: one cached prefix shared by all
    // students (Haiku 5.5 caches from 512 tokens). The chat-specific line comes after it.
    instructions: [
      { role: "system", content: CORE_INSTRUCTIONS, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "system", content: [chatContext(turn), turn.planNote, partnerContext(turn.partnerVoice ?? null, turn.studentName ?? null), resumeNote, answerNote, TURN_REMINDER].filter(Boolean).join("\n\n") },
    ],
    messages: [
      ...turn.history,
      // Cache breakpoint: every later step of this turn resends everything up to here.
      { role: "user", content: turn.userMessage, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "assistant", content: pre.map((c) => ({ type: "tool-call" as const, toolCallId: c.id, toolName: c.name, input: c.input })) },
      { role: "tool", content: pre.map((c) => ({ type: "tool-result" as const, toolCallId: c.id, toolName: c.name, output: { type: "json" as const, value: c.output as never } })) },
    ],
    tools: buildTools(ctx),
    stopWhen: isStepCount(turn.calculationHeavy ? MAX_STEPS_CALCULATION : MAX_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    prepareStep: () =>
      longAnswer ? { maxOutputTokens: MAX_OUTPUT_TOKENS_WALKTHROUGH } : ctx.readMaterial || summaryAsked ? { maxOutputTokens: MAX_OUTPUT_TOKENS_SUMMARY } : {},
    providerOptions: {
      // Grounded answers from retrieved slides: thinking adds latency before the first word
      // (PRD target: p95 time to first token <= 3 s). Allowed on Haiku 5.5 at effort <= high.
      anthropic: { thinking: { type: "disabled" } },
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

    must(
      await db.from("traces").insert({
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
      }),
    );
  }

  const summary = (): TurnSummary => ({
    citations: [...cited.values()],
    fallback: turn.topicTitle ? { topic: turn.topicTitle, used: [...cited.values()].some((c) => c.outside_topic) } : null,
  });

  return { result, summary };
}
