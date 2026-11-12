import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { createCitationFilter } from "./citations";
import { CORE_INSTRUCTIONS, chatContext, partnerContext } from "./prompt";
import { buildTools, getMaterialPages, materialKey, newContext, searchSlides, type AgentContext, type Citation } from "./tools";
import { adminClient, must } from "@/lib/supabase/admin";
import { parseSlideKey } from "@/lib/study/course-code";

export const CHAT_MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
export const HISTORY_LIMIT = 12; // PRD §10.6
const MAX_STEPS = 6; // a search, a follow-up search or reads, and the answer
const MAX_STEPS_CALCULATION = 10; // plus calculate (sometimes twice, after a fix) and optimize
const MAX_OUTPUT_TOKENS = 2000; // room to teach, not just restate the slides
const MAX_OUTPUT_TOKENS_SUMMARY = 3000; // once the agent has read whole materials
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

export function preSearchQuery(turn: Pick<ChatTurn, "userMessage" | "history">): string {
  const lastUser = [...turn.history].reverse().find((m) => m.role === "user");
  const previous = typeof lastUser?.content === "string" ? lastUser.content : "";
  return turn.userMessage.length < 80 && previous ? `${previous}\n${turn.userMessage}` : turn.userMessage;
}

const SUMMARY_WORDS = /\b(summar|overview|recap|outline of|go through|walk me through)/i;

export async function runChatTurn(turn: ChatTurn) {
  const db = adminClient();
  const ctx: AgentContext = newContext({
    db,
    courseId: turn.courseId,
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
    const streamText_ = (controller: Ctrl, id: string, raw: string) => {
      let text = filterFor(id).push(raw);
      if (text && needsBreak.delete(id)) text = `\n\n${text.replace(/^\s+/, "")}`;
      emit(controller, id, text);
    };
    const release = (controller: Ctrl, id: string) => {
      const h = held.get(id);
      if (!h) return;
      held.delete(id);
      controller.enqueue(h.start);
      streamText_(controller, id, h.raw);
      if (h.end) {
        emit(controller, id, filterFor(id).flush());
        controller.enqueue(h.end);
      }
    };
    return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(part, controller) {
        switch (part.type) {
          case "text-start":
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
            emit(controller, part.id, filterFor(part.id).flush());
            break;
          }
          case "tool-input-start":
          case "tool-call":
            for (const [id, h] of held) {
              if (h.raw.trim()) errors.push({ code: "narration_dropped", detail: h.raw.trim().slice(0, 200) });
              held.delete(id);
              needsBreak.delete(id);
            }
            break;
          case "finish-step":
          case "finish":
            for (const id of [...held.keys()]) release(controller, id);
            break;
        }
        controller.enqueue(part);
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
  const preCalls: { tool: typeof searchSlides | typeof getMaterialPages; input: Record<string, unknown> }[] = [];
  if (focus) {
    preCalls.push({ tool: getMaterialPages, input: { material: focus.material, from: focus.number, to: focus.number } });
  } else if (asksForCodeOverview(turn.userMessage)) {
    for (const m of await practicalMaterials(db, turn.courseId, turn.topicId)) {
      preCalls.push({ tool: getMaterialPages, input: { material: materialKey(turn.courseCode, m.material_order), from: 1, to: m.pages } });
    }
  }
  if (!preCalls.length) {
    preCalls.push({ tool: searchSlides, input: { query: preSearchQuery(turn), ...(asksForOtherMaterial(turn.userMessage) ? { include: ["other" as const] } : {}) } });
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
      { role: "system", content: [chatContext(turn), turn.planNote, partnerContext(turn.partnerVoice ?? null, turn.studentName ?? null)].filter(Boolean).join("\n\n") },
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
    prepareStep: () => (ctx.readMaterial || summaryAsked ? { maxOutputTokens: MAX_OUTPUT_TOKENS_SUMMARY } : {}),
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
