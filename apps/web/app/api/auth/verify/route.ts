import { NextResponse } from "next/server";
import { isOtpCode, isPauEmail, normalizeEmail, PAU_EMAIL_ERROR } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";

/** POST {email, code} → checks the code, sets the session cookie, says where to go next. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!isPauEmail(email)) {
    return NextResponse.json({ error: PAU_EMAIL_ERROR }, { status: 400 });
  }
  if (!isOtpCode(body?.code)) {
    return NextResponse.json({ error: "Enter the code from the email." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: body.code.trim(), type: "email" });
  if (error || !data.user) {
    return NextResponse.json({ error: "That code is wrong or has expired. Request a new one." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", data.user.id).single();
  return NextResponse.json({ ok: true, next: profile?.onboarded ? "/dashboard" : "/welcome" });
}
