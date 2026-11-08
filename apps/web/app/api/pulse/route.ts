import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// PRD F7: "Is this helping you study? (1–5)", asked once after the 10th question. One row per student.
const Body = z.object({ score: z.number().int().min(1).max(5) }).strict();

/** POST {score} → saves the student's answer (a later answer replaces it). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a number from 1 to 5." }, { status: 400 });
  const { error } = await supabase
    .from("pulse_responses")
    .upsert({ user_id: auth.user.id, score: parsed.data.score, created_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
