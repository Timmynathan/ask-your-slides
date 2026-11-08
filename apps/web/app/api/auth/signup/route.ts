import { NextResponse } from "next/server";
import { isPauEmail, normalizeEmail, PAU_EMAIL_ERROR } from "@/lib/auth/email";
import { directSignupEnabled } from "@/lib/auth/signup-mode";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// TEMPORARY (pilot only): sign up with PAU email + password, no emailed code, because PAU's
// Microsoft 365 filter is holding the code emails back. On only while AUTH_DIRECT_SIGNUP=1.
// Risk, accepted by the owner for a private pilot of ~10 students: the address isn't proven, so
// someone who knows a PAU email could sign up as that student. Turn it off (unset the variable)
// once "Continue with Microsoft" is approved or the code emails arrive.
const MIN_PASSWORD = 8;

/** POST {email, password} → creates a confirmed account, signs it in, says where to go next. */
export async function POST(request: Request) {
  if (!directSignupEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!isPauEmail(email)) return NextResponse.json({ error: PAU_EMAIL_ERROR }, { status: 400 });
  if (password.length < MIN_PASSWORD) return NextResponse.json({ error: `Use at least ${MIN_PASSWORD} characters.` }, { status: 400 });

  const admin = adminClient();
  // Admin-created users skip the auth hook, so the PAU check above is the gate.
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) {
    const exists = createError.status === 422 || /already (been )?registered|exists/i.test(createError.message);
    if (!exists) {
      console.error("direct sign-up failed", createError.message);
      return NextResponse.json({ error: "Couldn't create your account. Try again." }, { status: 500 });
    }
    // An account exists. If it was only half-made (a code was requested, never used), finish it
    // with this password; if it's a real account, send them to Log in.
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = list?.users.find((u) => u.email?.toLowerCase() === email);
    const { data: prof } = user ? await admin.from("profiles").select("onboarded").eq("id", user.id).maybeSingle() : { data: null };
    if (!user || user.email_confirmed_at || prof?.onboarded) {
      return NextResponse.json({ error: "You already have an account with this email.", code: "account_exists" }, { status: 409 });
    }
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) return NextResponse.json({ error: "Couldn't create your account. Try again." }, { status: 500 });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return NextResponse.json({ error: "Account created, but signing in failed. Try Log in." }, { status: 500 });
  return NextResponse.json({ ok: true, next: "/welcome" });
}
