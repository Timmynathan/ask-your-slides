import { createUIMessageStreamResponse, toUIMessageStream, type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HISTORY_LIMIT, historyText, runChatTurn } from "@/lib/agent/run";
import { isPartnerId, PARTNERS } from "@/lib/partners";
import { adminClient, must } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SLIDE_KEY_RE } from "@/lib/study/course-code";
import { admitChatTurn, LIMIT_MESSAGES } from "@/lib/plans/gate";

export const maxDuration = 60;

export const DAILY_LIMIT_MESSAGE = LIMIT_MESSAGES.daily_cap;

const Body = z.object({
  conversation_id: z.string().uuid(),
  // Plain text, or the last UI message from useChat.
  message: z.union([
    z.string(),
    z.object({ parts: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).transform((m) =>
      m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join(""),
    ),
  ]).pipe(z.string().trim().min(1, "Type a question first.").max(4000, "That message is too long.")),
  // The question's id as the chat shows it, so it can be edited later under the same id.
  message_id: z.string().uuid().optional(),
  // True when the student edited an earlier question: that question and everything after it is
  // replaced by this one.
  edit: z.boolean().optional(),
  // "Ask about this…" from the viewer: the exact slide/section/code part the question is about.
  focus_slide: z.string().regex(SLIDE_KEY_RE).optional(),
});

const EDIT_GONE_MESSAGE = "That question can't be edited any more. Refresh the page and try again.";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  }
  const { conversation_id: conversationId, message, message_id: messageId, edit, focus_slide: focusSlide } = parsed.data;
  if (edit && !messageId) return NextResponse.json({ error: EDIT_GONE_MESSAGE }, { status: 400 });

  // Read as the student: RLS returns the conversation only if it is theirs. Course and topic come
  // from this row, never from the request body.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, title, course_id, topic_id, courses(code, code_confirmed, calculation_heavy, premium, title, department), topics(title)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const course = convo.courses as unknown as { code: string; code_confirmed: boolean; calculation_heavy: boolean; premium: boolean; title: string; department: string };
  const topic = convo.topics as unknown as { title: string } | null;

  // Editing: the question must be one of the student's own, in this chat (RLS + the filters).
  let editFrom: { created_at: string } | null = null;
  if (edit) {
    const { data: original } = await supabase
      .from("messages")
      .select("created_at")
      .eq("id", messageId!)
      .eq("conversation_id", conversationId)
      .eq("role", "user")
      .maybeSingle();
    if (!original) return NextResponse.json({ error: EDIT_GONE_MESSAGE }, { status: 409 });
    editFrom = original;
  }

  const { data: profile } = await supabase.from("profiles").select("display_name, study_partner").eq("id", auth.user.id).single();
  const partner = isPartnerId(profile?.study_partner) ? PARTNERS[profile.study_partner] : null;

  const db = adminClient();
  // Plan limits (PRD F12), on the server: quiz/summary locks, daily and premium-course caps.
  const gate = await admitChatTurn(db, { userId: auth.user.id, courseId: convo.course_id, premium: course.premium, message });
  if (!gate.ok) return NextResponse.json(gate.refusal.body, { status: gate.refusal.status });
  const admitted = gate.turn;

  let editsFirstQuestion = false;
  if (editFrom) {
    // Like ChatGPT/Claude: the edited question and every message after it go; the chat continues
    // from the new wording. Ratings on the removed answers go with them (on delete cascade).
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .lt("created_at", editFrom.created_at);
    editsFirstQuestion = count === 0;
    must(await db.from("messages").delete().eq("conversation_id", conversationId).gte("created_at", editFrom.created_at));
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

  const row: { id?: string; conversation_id: string; user_id: string; role: "user"; content: string } = {
    conversation_id: conversationId,
    user_id: auth.user.id,
    role: "user",
    content: message,
  };
  let saved = await db.from("messages").insert(messageId ? { ...row, id: messageId } : row).select("id").single();
  // The id is already taken (never by this chat's live questions): save under a fresh id instead.
  if (saved.error?.code === "23505") saved = await db.from("messages").insert(row).select("id").single();
  const userMessageId = (must(saved) as { id: string }).id;
  if (convo.title === "New chat" || editsFirstQuestion) {
    await db.from("conversations").update({ title: message.slice(0, 80) }).eq("id", conversationId);
  }

  const assistantMessageId = crypto.randomUUID();
  const { result, summary } = await runChatTurn({
    userId: auth.user.id,
    conversationId,
    courseId: convo.course_id,
    courseCode: course.code,
    courseTitle: course.title,
    courseCodeConfirmed: course.code_confirmed,
    calculationHeavy: course.calculation_heavy,
    department: course.department,
    topicId: convo.topic_id,
    topicTitle: topic?.title ?? null,
    userMessage: message,
    history,
    partnerVoice: partner?.voice ?? null,
    studentName: profile?.display_name?.split(/\s+/)[0] ?? null,
    assistantMessageId,
    userMessageId,
    startedAt,
    // Only a key of this chat's course (the conversation row decides the course, never the body).
    focusSlide: focusSlide?.startsWith(`${course.code}-`) ? focusSlide : undefined,
    planNote: admitted.planNote,
    refund: admitted.refund,
  });

  // Finish (and save) the answer even if the student closes the tab mid-stream.
  result.consumeStream();

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      generateMessageId: () => assistantMessageId,
      messageMetadata: ({ part }) =>
        part.type === "finish" ? { ...summary(), remaining: admitted.remaining, plan: admitted.state.plan } : undefined,
      onError: () => "Something went wrong while answering. Please try again.",
    }),
  });
}
