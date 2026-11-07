import { NextResponse } from "next/server";
import { isPauEmail, normalizeEmail, PAU_EMAIL_ERROR } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";

/** POST {email} → sends a sign-in code. Non-PAU addresses are rejected before Supabase is called. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!isPauEmail(email)) {
    return NextResponse.json({ error: PAU_EMAIL_ERROR }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) {
    if (error.status === 429) {
      return NextResponse.json({ error: "Too many codes requested. Wait a minute and try again." }, { status: 429 });
    }
    // The auth hook's message ("Use your PAU email.") or a mail delivery problem.
    const blocked = error.message?.includes(PAU_EMAIL_ERROR);
    console.error("signInWithOtp failed", { status: error.status, code: error.code, message: error.message });
    return NextResponse.json(
      { error: blocked ? PAU_EMAIL_ERROR : "We couldn't send the code. Try again in a moment." },
      { status: blocked ? 400 : 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
