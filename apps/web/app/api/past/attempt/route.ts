import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAT_MODEL } from "@/lib/agent/run";
import { effectiveMarks, paperLabel, stems, type PastQuestion } from "@/lib/past/map";
import { MARKING_INSTRUCTIONS, MarkingOutput, markingPrompt, normaliseScheme, scoreFrom, type SchemePoint } from "@/lib/past/marking";
import type { CitationInfo } from "@/lib/study/format";
import { adminClient, must } from "@/lib/supabase/admin";
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";
import { createClient } from "@/lib/supabase/server";

// POST /api/past/attempt (PRD F10 B)
//   {question_id, answer}         written: marked by CHAT_MODEL against the scheme (counts towards the daily cap)
//   {question_id, answer: "B"}    multiple choice: instant, no model call
//   {question_id, reveal: true}   "Show answer": saved as an attempt with no score
// The model answer, scheme and MCQ key are only ever sent from here, after an attempt.

export const maxDuration = 60;

const DAILY_LIMIT_MESSAGE = "Daily limit reached. Resets at midnight (WAT).";
const USD_PER_MTOK = { input: 0.1, output: 0.5 }; // Claude Haiku 5.5, as in lib/agent/run.ts

const Body = z.union([
  z.object({ question_id: z.string().uuid(), reveal: z.literal(true) }),
  z.object({ question_id: z.string().uuid(), answer: z.string().trim().min(1, "Write an answer first.").max(8000, "That answer is too long.") }),
]);

function dailyCap() {
  const n = Number(process.env.DAILY_MESSAGE_CAP);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

type Full = PastQuestion & {
  course_id: string;
  model_answer: string | null;
  marking_scheme: SchemePoint[] | null;
  answer_key: string | null;
  answer_explanation: string | null;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!PAST_QUESTIONS_LIVE) return NextResponse.json({ error: "Past questions are coming soon." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const body = parsed.data;

  // Visible to this student? (RLS: signed in, reviewed paper.) Only then read the answer columns.
  const { data: visible } = await supabase.from("past_questions").select("id").eq("id", body.question_id).maybeSingle();
  if (!visible) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  const db = adminClient();
  const q = must(
    await db
      .from("past_questions")
      .select("id, course_id, paper_id, origin, number, parent_id, section, text, marks, type, options, relevance, repeat_group, sort_order, model_answer, marking_scheme, answer_key, answer_explanation")
      .eq("id", body.question_id)
      .single(),
  ) as Full;
  // Parents and siblings: the stem for context, and marks for parts that print none.
  const family = q.paper_id
    ? (must(await db.from("past_questions").select("id, parent_id, text, marks, number, sort_order").eq("paper_id", q.paper_id)) as PastQuestion[])
    : [q];
  const byId = new Map(family.map((x) => [x.id, x]));
  const max = effectiveMarks(q, byId, family) || 1;
  const reveal = {
    model_answer: q.model_answer,
    citations: await citationsFor(q),
    answer_key: q.type === "mcq" ? q.answer_key : null,
    explanation: q.type === "mcq" ? q.answer_explanation : null,
    max,
  };

  // "Show answer"
  if ("reveal" in body) {
    must(await db.from("practice_attempts").insert({ user_id: auth.user.id, question_id: q.id, revealed_only: true }));
    return NextResponse.json({ mode: "revealed", ...reveal });
  }

  // Multiple choice: instant.
  if (q.type === "mcq") {
    const chosen = body.answer.trim().toUpperCase();
    const correct = !!q.answer_key && chosen === q.answer_key.trim().toUpperCase();
    const score = correct ? max : 0;
    must(await db.from("practice_attempts").insert({ user_id: auth.user.id, question_id: q.id, answer: chosen, score, max_score: max, feedback: { correct } }));
    return NextResponse.json({ mode: "mcq", correct, score, ...reveal });
  }

  // Written: one model call, counted like a chat message.
  const cap = dailyCap();
  const [usage] = must(await db.rpc("consume_message", { p_user_id: auth.user.id, p_cap: cap })) as { allowed: boolean; used: number }[];
  if (!usage.allowed) return NextResponse.json({ error: DAILY_LIMIT_MESSAGE, remaining: 0 }, { status: 429 });

  const scheme = normaliseScheme(q.marking_scheme, max);
  const [{ data: course }, { data: paper }] = await Promise.all([
    db.from("courses").select("code, title").eq("id", q.course_id).single(),
    q.paper_id ? db.from("past_papers").select("session, type").eq("id", q.paper_id).single() : Promise.resolve({ data: null }),
  ]);
  const prompt = markingPrompt({
    course: `${course?.code} ${course?.title}`,
    paper: paper ? paperLabel(paper as never) : "practice question",
    number: q.number,
    marks: max,
    stems: stems(q, family),
    question: q.text,
    scheme,
    modelAnswer: q.model_answer ?? "",
    answer: body.answer,
  });

  let result;
  try {
    result = await generateText({
      model: anthropic(CHAT_MODEL),
      system: MARKING_INSTRUCTIONS,
      prompt,
      output: Output.object({ schema: MarkingOutput }),
      maxOutputTokens: 1500,
      providerOptions: { anthropic: { thinking: { type: "disabled" } } },
    });
  } catch (e) {
    await db.rpc("refund_message", { p_user_id: auth.user.id });
    console.error("marking failed", e);
    return NextResponse.json({ error: "Couldn't mark that just now. Try again." }, { status: 502 });
  }
  const marking = result.output;
  const score = scoreFrom(scheme, marking.points, max);
  const feedback = { good: marking.good, missing: marking.missing, summary: marking.summary, points: scheme.map((p, i) => ({ ...p, awarded: marking.points[i]?.awarded ?? "none" })) };

  const inTok = result.usage.inputTokens ?? 0;
  const outTok = result.usage.outputTokens ?? 0;
  await Promise.all([
    db.from("practice_attempts").insert({ user_id: auth.user.id, question_id: q.id, answer: body.answer, score, max_score: max, feedback }).then(must),
    db
      .from("traces")
      .insert({
        kind: "marking",
        course_id: q.course_id,
        user_id: auth.user.id,
        user_message: body.answer,
        tool_calls: [{ name: "mark", input: { question_id: q.id, number: q.number, max } }],
        output_text: JSON.stringify({ score, ...marking }),
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: Number(((inTok * USD_PER_MTOK.input + outTok * USD_PER_MTOK.output) / 1e6).toFixed(6)),
        model: CHAT_MODEL,
        latency_ms: Date.now() - startedAt,
      })
      .then(must),
  ]);

  return NextResponse.json({ mode: "marked", score, feedback, remaining: Math.max(0, cap - usage.used), ...reveal });
}

/** Chip details for the slides a model answer cites (same chips as chat). */
async function citationsFor(q: Full): Promise<CitationInfo[]> {
  const keys = [...new Set([...(q.model_answer ?? "").matchAll(/\[\[s:([A-Za-z0-9-]+)\]\]/g)].map((m) => m[1]))];
  if (!keys.length) return [];
  const rows = must(
    await adminClient()
      .from("slides")
      .select("slide_key, slide_number, materials(title, kind, topics(title))")
      .eq("course_id", q.course_id)
      .in("slide_key", keys),
  ) as unknown as { slide_key: string; slide_number: number; materials: { title: string; kind: string; topics: { title: string } | null } }[];
  return rows.map((r) => ({
    slide_key: r.slide_key,
    slide_number: r.slide_number,
    material_title: r.materials?.title,
    material_kind: r.materials?.kind,
    topic_title: r.materials?.topics?.title ?? null,
  }));
}
