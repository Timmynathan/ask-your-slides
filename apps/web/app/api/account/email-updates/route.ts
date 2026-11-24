import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// PATCH {on} → the "Email me updates" setting (account settings). Sign-in codes are always sent.
const Body = z.object({ on: z.boolean() }).strict();

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const { on } = parsed.data;
  const { error } = await adminClient()
    .from("profiles")
    .update({ email_updates: on, email_unsubscribed_at: on ? null : new Date().toISOString() })
    .eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
