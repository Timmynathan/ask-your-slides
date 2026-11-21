import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { routeQuestion } from "@/lib/study/route-question";

// "Ask anything" (dashboard): which of the student's courses is this question about? Returns the
// ranked courses; the dashboard opens the question in the first one's chat, or lets the student pick.
const Body = z.object({ message: z.string().trim().min(1, "Type a question first.").max(4000, "That message is too long.") });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { data: profile } = await supabase.from("profiles").select("level").eq("id", auth.user.id).single();
  const routed = await routeQuestion(supabase, profile?.level ?? null, parsed.data.message);
  if (!routed.choices.length) return NextResponse.json({ error: "You don't have any courses with slides yet." }, { status: 400 });
  return NextResponse.json(routed);
}
