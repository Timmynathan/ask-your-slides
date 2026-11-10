import { NextResponse } from "next/server";
import { programmeChoices } from "@/lib/programmes";
import { createClient } from "@/lib/supabase/server";

/** GET /api/programmes → what a student can choose ("Change programme" in the account menu). */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [choices, { data: profile }] = await Promise.all([
    programmeChoices(supabase),
    supabase.from("profiles").select("programme, level").eq("id", auth.user.id).single(),
  ]);
  return NextResponse.json({ choices, current: profile ?? null });
}
