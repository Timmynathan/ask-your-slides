import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  // "local": end only this browser's session. The default ("global") also signed the student out
  // on every other device, so signing out on a phone forced a new code on the laptop too.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
}
