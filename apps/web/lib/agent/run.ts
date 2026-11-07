import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, streamText, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { createCitationFilter } from "./citations";
import { CORE_INSTRUCTIONS, chatContext, partnerContext } from "./prompt";
import { buildTools, newContext, searchSlides, type AgentContext, type Citation } from "./tools";
import { adminClient, must } from "@/lib/supabase/admin";

export const CHAT_MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
export const HISTORY_LIMIT = 12; // PRD §10.6
const MAX_STEPS = 6; // a search, a follow-up search or reads, and the answer
const MAX_OUTPUT_TOKENS = 1200;
const MAX_OUTPUT_TOKENS_SUMMARY = 2000; // once the agent has read whole materials
// Claude Haiku 5.5, prompts <= 100K tokens (check the provider page before launch).
const USD_PER_MTOK = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

export interface ChatTurn {
  userId: string;
  conversationId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  topicId: string | null;
  topicTitle: string | null;
  userMessage: string;
  history: ModelMessage[];
  /** Study partner's voice (lib/partners.ts) and the student's first name, if known. */
  partnerVoice?: string | null;
  studentName?: string | null;
  assistantMessageId: string;
  startedAt: number;
  abortSignal?: AbortSignal;
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
    // Costs at most the time to generate ~120 characters before the first word.
    const NARRATION_MAX = 120;
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
  const preSearchInput = { query: preSearchQuery(turn) };
  const preSearchOutput = await searchSlides.run(ctx, preSearchInput);
  const preSearchId = `presearch_${turn.assistantMessageId}`;

  const result = streamText({
    model: anthropic(CHAT_MODEL),
    // Tools + core instructions are identical in every chat: one cached prefix shared by all
    // students (Haiku 5.5 caches from 512 tokens). The chat-specific line comes after it.
    instructions: [
      { role: "system", content: CORE_INSTRUCTIONS, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "system", content: [chatContext(turn), partnerContext(turn.partnerVoice ?? null, turn.studentName ?? null)].filter(Boolean).join("\n\n") },
    ],
    messages: [
      ...turn.history,
      // Cache breakpoint: every later step of this turn resends everything up to here.
      { role: "user", content: turn.userMessage, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: preSearchId, toolName: searchSlides.name, input: preSearchInput }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: preSearchId, toolName: searchSlides.name, output: { type: "json", value: preSearchOutput as never } }] },
    ],
    tools: buildTools(ctx),
    stopWhen: isStepCount(MAX_STEPS),
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
    if (output.trim()) {
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
      await db.rpc("refund_message", { p_user_id: turn.userId });
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
