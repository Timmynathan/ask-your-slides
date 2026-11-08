import { NextResponse } from "next/server";
import { isPauEmail, normalizeEmail, PAU_EMAIL_ERROR } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";

/** POST {email, password} → signs in with a password set earlier. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!isPauEmail(email)) return NextResponse.json({ error: PAU_EMAIL_ERROR }, { status: 400 });
  if (typeof body?.password !== "string" || !body.password) {
    return NextResponse.json({ error: "Enter your password." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: body.password });
  if (error || !data.user) {
    if (error?.status === 429) {
      return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
    }
    // Same message for unknown email, no password set yet, and wrong password: don't reveal which.
    return NextResponse.json(
      { error: "Wrong email or password. New here? Choose “Create account” above. Forgot it? Use “Forgot password?”." },
      { status: 401 },
    );
  }
  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", data.user.id).single();
  return NextResponse.json({ ok: true, next: profile?.onboarded ? "/dashboard" : "/welcome" });
}
