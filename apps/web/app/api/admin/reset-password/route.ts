import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { isPauEmail, normalizeEmail, passwordProblem } from "@/lib/auth/email";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** POST {email, password} (owner only) → sets a student's password, after "Escalate to admin". */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isAdminEmail(auth.user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body?.email);
  if (!isPauEmail(email)) return NextResponse.json({ error: "Enter the student's PAU email." }, { status: 400 });
  const problem = passwordProblem(body?.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) return NextResponse.json({ error: "No account with that email." }, { status: 404 });
  const { error } = await admin.auth.admin.updateUserById(profile.id, { password: body.password });
  if (error) return NextResponse.json({ error: `Couldn't set the password: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
