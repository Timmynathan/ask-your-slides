// The plan check in front of every chat turn (PRD F12). Runs on the server before the model:
// quiz and summary locks first (nothing counted), then the daily and premium-course caps
// (atomic in the database), then the summary allowance. Refusals are logged to limit_events.
import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { must } from "@/lib/supabase/admin";
import { planState, logLimitEvent, usageNow, type LimitFeature, type PlanState, type UsageNow } from "./entitlement";
import { asksForQuiz, asksForSummary, nextLagosMidnight } from "./limits";

type Db = ReturnType<typeof adminClient>;

export const LIMIT_MESSAGES: Record<LimitFeature, string> = {
  daily_cap: "Daily limit reached. Resets at midnight (WAT).",
  premium_cap: "You've used today's free questions for this premium course. Resets at midnight (WAT).",
  summary: "You've used your free summary. Summaries are unlimited on Finals.",
  quiz: "Quiz mode comes with Finals.",
  past: "You've used this course's free practice question. Every past question comes with Finals.",
};

export interface Refusal {
  status: 403 | 429;
  body: { error: string; code: LimitFeature; plan: string; remaining: 0; resets_at: string | null };
}

export interface Admitted {
  state: PlanState;
  usage: UsageNow;
  /** Messages left in this course today, after this one. */
  remaining: number;
  /** This turn is the student's (counted) summary request. */
  summary: boolean;
  /** Extra instructions for the model about what this plan allows. */
  planNote: string | null;
  /** Give back what this turn took (a turn that produced nothing). */
  refund: () => Promise<void>;
}

export async function admitChatTurn(
  db: Db,
  opts: { userId: string; courseId: string; premium: boolean; message: string; now?: Date; kind?: "chat" | "marking" },
): Promise<{ ok: true; turn: Admitted } | { ok: false; refusal: Refusal }> {
  const now = opts.now ?? new Date();
  const state = await planState(db, opts.userId, now);
  const usage = await usageNow(db, state, { userId: opts.userId, courseId: opts.courseId, premium: opts.premium, now });
  const { limits } = usage;
  const chat = (opts.kind ?? "chat") === "chat";

  const refuse = async (feature: LimitFeature): Promise<{ ok: false; refusal: Refusal }> => {
    await logLimitEvent(db, { userId: opts.userId, plan: state.plan, courseId: opts.courseId, feature });
    const resets = feature === "daily_cap" || feature === "premium_cap" ? nextLagosMidnight(now).toISOString() : null;
    return {
      ok: false,
      refusal: {
        status: feature === "quiz" || feature === "summary" ? 403 : 429,
        body: { error: LIMIT_MESSAGES[feature], code: feature, plan: state.plan, remaining: 0, resets_at: resets },
      },
    };
  };

  const wantsQuiz = chat && asksForQuiz(opts.message);
  const wantsSummary = chat && asksForSummary(opts.message);
  if (wantsQuiz && !limits.quiz) return refuse("quiz");
  if (wantsSummary && limits.summaries !== null && usage.summariesUsed >= limits.summaries) return refuse("summary");

  const [taken] = must(
    await db.rpc("consume_message_plan", {
      p_user_id: opts.userId,
      p_day: usage.day,
      p_cap: limits.daily,
      p_course_id: opts.courseId,
      p_course_cap: limits.course,
    }),
  ) as { allowed: boolean; reason: "daily_cap" | "premium_cap" | null; used: number; course_used: number }[];
  if (!taken.allowed) return refuse(taken.reason ?? "daily_cap");

  const refundMessage = async () => {
    await db.rpc("refund_message_plan", { p_user_id: opts.userId, p_day: usage.day, p_course_id: opts.courseId });
  };

  let summaryUseId: number | null = null;
  if (wantsSummary) {
    const [s] = must(
      await db.rpc("consume_summary", { p_user_id: opts.userId, p_course_id: opts.courseId, p_limit: limits.summaries }),
    ) as { allowed: boolean; used: number; use_id: number | null }[];
    if (!s.allowed) {
      // Another tab took the last summary between the check and now.
      await refundMessage();
      return refuse("summary");
    }
    summaryUseId = s.use_id;
  }

  const remaining = Math.max(
    0,
    Math.min(limits.daily - taken.used, limits.course === null ? Infinity : limits.course - taken.course_used),
  );
  return {
    ok: true,
    turn: {
      state,
      usage,
      remaining,
      summary: wantsSummary,
      planNote: planNote(limits.quiz, limits.summaries !== null && !wantsSummary && usage.summariesUsed >= limits.summaries),
      refund: async () => {
        await refundMessage();
        if (summaryUseId !== null) await db.from("summary_uses").delete().eq("id", summaryUseId);
      },
    },
  };
}

/** Second line of defence: requests the server's word match misses ("walk me through all of it"). */
function planNote(quiz: boolean, summariesUsedUp: boolean): string | null {
  const lines: string[] = [];
  if (!quiz) {
    lines.push(
      "Quiz mode is not on this student's plan (Free). Never quiz them or set questions for them to answer. If they ask for a quiz or practice questions, say in one sentence that quiz mode comes with Finals, then offer to explain the topic instead.",
    );
  }
  if (summariesUsedUp) {
    lines.push(
      "This student has used their one free summary. Don't write a summary or overview of a topic, a lecture or the course. If they ask for one, say in one sentence that summaries come with Finals, then offer to answer a specific question instead.",
    );
  }
  return lines.length ? `Plan limits:\n- ${lines.join("\n- ")}` : null;
}
