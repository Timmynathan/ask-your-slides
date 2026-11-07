import { createUIMessageStreamResponse, toUIMessageStream, type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HISTORY_LIMIT, historyText, runChatTurn } from "@/lib/agent/run";
import { isPartnerId, PARTNERS } from "@/lib/partners";
import { adminClient, must } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export const DAILY_LIMIT_MESSAGE = "Daily limit reached. Resets at midnight (WAT).";

const Body = z.object({
  conversation_id: z.string().uuid(),
  // Plain text, or the last UI message from useChat.
  message: z.union([
    z.string(),
    z.object({ parts: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).transform((m) =>
      m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join(""),
    ),
  ]).pipe(z.string().trim().min(1, "Type a question first.").max(4000, "That message is too long.")),
});

function dailyCap() {
  const n = Number(process.env.DAILY_MESSAGE_CAP);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  }
  const { conversation_id: conversationId, message } = parsed.data;

  // Read as the student: RLS returns the conversation only if it is theirs. Course and topic come
  // from this row, never from the request body.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, title, course_id, topic_id, courses(code, title, department), topics(title)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const course = convo.courses as unknown as { code: string; title: string; department: string };
  const topic = convo.topics as unknown as { title: string } | null;

  const { data: profile } = await supabase.from("profiles").select("display_name, study_partner").eq("id", auth.user.id).single();
  const partner = isPartnerId(profile?.study_partner) ? PARTNERS[profile.study_partner] : null;

  const db = adminClient();
  const cap = dailyCap();
  const [usage] = must(await db.rpc("consume_message", { p_user_id: auth.user.id, p_cap: cap })) as { allowed: boolean; used: number }[];
  if (!usage.allowed) {
    return NextResponse.json({ error: DAILY_LIMIT_MESSAGE, remaining: 0 }, { status: 429 });
  }

  const recent = must(
    await db
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ) as { role: "user" | "assistant"; content: string }[];
  const history: ModelMessage[] = recent
    .reverse()
    .map((m) => ({ role: m.role, content: m.role === "assistant" ? historyText(m.content) : m.content }));

  must(await db.from("messages").insert({ conversation_id: conversationId, user_id: auth.user.id, role: "user", content: message }));
  if (convo.title === "New chat") {
    await db.from("conversations").update({ title: message.slice(0, 80) }).eq("id", conversationId);
  }

  const assistantMessageId = crypto.randomUUID();
  const { result, summary } = await runChatTurn({
    userId: auth.user.id,
    conversationId,
    courseId: convo.course_id,
    courseCode: course.code,
    courseTitle: course.title,
    department: course.department,
    topicId: convo.topic_id,
    topicTitle: topic?.title ?? null,
    userMessage: message,
    history,
    partnerVoice: partner?.voice ?? null,
    studentName: profile?.display_name?.split(/\s+/)[0] ?? null,
    assistantMessageId,
    startedAt,
  });

  // Finish (and save) the answer even if the student closes the tab mid-stream.
  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      generateMessageId: () => assistantMessageId,
      messageMetadata: ({ part }) =>
        part.type === "finish" ? { ...summary(), remaining: Math.max(0, cap - usage.used) } : undefined,
      onError: () => "Something went wrong while answering. Please try again.",
    }),
  });
}
