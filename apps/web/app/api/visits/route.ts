import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Runs as the student: RLS keeps every row their own. Missing table (before migration
// 20261122000002 is pushed): quietly does nothing.
const Body = z.object({ topic_id: z.string().uuid(), chat_id: z.string().uuid().nullable() }).strict();

/** POST {topic_id, chat_id} → "I'm in this lecture, in this chat (or a new one)", for Recent lectures. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await supabase
    .from("topic_visits")
    .upsert({ user_id: userId, topic_id: parsed.data.topic_id, chat_id: parsed.data.chat_id, visited_at: new Date().toISOString() }, { onConflict: "user_id,topic_id" });
  return NextResponse.json({ ok: true });
}
