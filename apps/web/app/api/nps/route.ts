import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// The recommend-us card (components/feedback/nps-card.tsx). Runs as the student (RLS: own rows only).
//   POST {score, page?}  → { id }      the 0-10 score, saved the moment it's tapped
//   PATCH {id, reason}   → { ok }      the optional "main reason" that follows
const Score = z.object({ score: z.number().int().min(0).max(10), page: z.string().max(200).optional() });
const Reason = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(1000) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Score.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { data, error } = await supabase
    .from("nps_responses")
    .insert({ user_id: auth.user.id, score: parsed.data.score, page: parsed.data.page ?? null })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: "Couldn't save it." }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Reason.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { error } = await supabase.from("nps_responses").update({ reason: parsed.data.reason }).eq("id", parsed.data.id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: "Couldn't save it." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
