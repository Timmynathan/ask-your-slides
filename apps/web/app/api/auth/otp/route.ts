import { NextResponse } from "next/server";
import { confirmedAccountExists } from "@/lib/auth/account";
import { isPauEmail, normalizeEmail, PAU_EMAIL_ERROR } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";

/**
 * POST {email, intent?} → sends a sign-in code. Non-PAU addresses are rejected before Supabase is called.
 * intent "signup": an email that already has an account gets 409 account_exists (no code sent), so the
 *   page can say "You already have an account. Log in."
 * intent "reset": an email with no account gets 404 no_account (no code sent), so the page can offer
 *   "Create account" instead.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!isPauEmail(email)) {
    return NextResponse.json({ error: PAU_EMAIL_ERROR }, { status: 400 });
  }

  const intent = body?.intent === "signup" || body?.intent === "reset" ? (body.intent as "signup" | "reset") : null;
  if (intent) {
    const exists = await confirmedAccountExists(email).catch(() => null); // on a lookup failure, just send the code
    if (intent === "signup" && exists === true) {
      return NextResponse.json({ error: "You already have an account with this email.", code: "account_exists" }, { status: 409 });
    }
    if (intent === "reset" && exists === false) {
      return NextResponse.json({ error: "There's no account for this email yet.", code: "no_account" }, { status: 404 });
    }
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
