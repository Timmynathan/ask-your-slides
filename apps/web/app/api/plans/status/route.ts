import { NextResponse } from "next/server";
import { planState } from "@/lib/plans/entitlement";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET → the student's plan right now, for components/plans/finals-watcher.tsx: an open page asks every
// 30 s while the student is on Free, so the "You're on Finals" pop-up shows the moment an admin approves
// the payment (owner, 26 Nov 2026), without a reload. Two small reads; no AI.
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const state = await planState(adminClient(), auth.user.id, new Date());
  return NextResponse.json({ plan: state.plan, welcome: state.welcome }, { headers: { "Cache-Control": "no-store" } });
}
