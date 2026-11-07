import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Runs as the student: RLS limits every read and write to their own conversations.

const Query = z.object({ course_id: z.string().uuid(), topic_id: z.string().uuid().nullable().optional() });

/** GET ?course_id=…[&topic_id=…|&topic_id=none] → that course's (or topic's) chats, newest first. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const url = new URL(request.url);
  const courseId = url.searchParams.get("course_id");
  const topicParam = url.searchParams.get("topic_id");
  if (!courseId || !z.string().uuid().safeParse(courseId).success) {
    return NextResponse.json({ error: "course_id is required." }, { status: 400 });
  }
  let q = supabase
    .from("conversations")
    .select("id, title, course_id, topic_id, updated_at")
    .eq("course_id", courseId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (topicParam === "none") q = q.is("topic_id", null);
  else if (topicParam) q = q.eq("topic_id", topicParam);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Couldn't load chats." }, { status: 500 });
  return NextResponse.json({ conversations: data });
}

/** POST {course_id, topic_id?} → a new chat. topic_id null/absent = whole-course chat. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Query.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "course_id is required." }, { status: 400 });
  const { data, error } = await supabase
    .from("conversations")
    .insert({ course_id: parsed.data.course_id, topic_id: parsed.data.topic_id ?? null })
    .select("id, title, course_id, topic_id, updated_at")
    .single();
  if (error) {
    // 23503: unknown course, or a topic from another course (composite foreign key).
    const status = error.code === "23503" ? 400 : 500;
    return NextResponse.json({ error: status === 400 ? "That course or topic doesn't exist." : "Couldn't create the chat." }, { status });
  }
  return NextResponse.json({ conversation: data }, { status: 201 });
}
