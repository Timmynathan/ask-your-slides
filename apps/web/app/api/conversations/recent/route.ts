import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { shellData } from "@/lib/nav/shell-data";

/** GET → the student's latest chats across their courses, newest first (the rail's chat list loads
 *  this when it opens, so a chat started since the page loaded is there). Runs as the student (RLS). */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { recent } = await shellData(supabase, auth.user);
  return NextResponse.json({ recent }, { headers: { "Cache-Control": "private, no-store" } });
}
