import { NextResponse } from "next/server";
import { z } from "zod";
import { FEEDBACK_FEATURE_IDS } from "@/lib/feedback-features";
import { createClient } from "@/lib/supabase/server";

// POST: general feedback from the Feedback window. Runs as the student (RLS: they can only add their own).
const Body = z.object({
  message: z.string().trim().min(1, "Tell us a little about it first.").max(2000, "That's a bit long: keep it under 2,000 characters."),
  sentiment: z.enum(["good", "bad"]).nullable().optional(),
  features: z.array(z.enum(FEEDBACK_FEATURE_IDS)).max(FEEDBACK_FEATURE_IDS.length).default([]),
  page: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { message, sentiment, features, page } = parsed.data;
  const { error } = await supabase.from("app_feedback").insert({ user_id: auth.user.id, message, sentiment: sentiment ?? null, features, page: page ?? null });
  if (error) return NextResponse.json({ error: "Couldn't send it. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
