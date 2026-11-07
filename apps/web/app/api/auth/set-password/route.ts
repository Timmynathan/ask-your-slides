import { NextResponse } from "next/server";
import { passwordProblem } from "@/lib/auth/email";
import { createClient } from "@/lib/supabase/server";

/** POST {password} → sets (or resets) the signed-in student's password. Reached right after the
 *  emailed code is verified, so the session proves they own the PAU address. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Your code session expired. Request a new code." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const problem = passwordProblem(body?.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { error } = await supabase.auth.updateUser({ password: body.password });
  if (error) {
    console.error("updateUser(password) failed", { status: error.status, code: error.code, message: error.message });
    const weak = error.code === "weak_password" || /password/i.test(error.message ?? "");
    return NextResponse.json(
      { error: weak ? error.message : "Couldn't save your password. Try again." },
      { status: weak ? 400 : 502 },
    );
  }
  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", auth.user.id).single();
  return NextResponse.json({ ok: true, next: profile?.onboarded ? "/dashboard" : "/welcome" });
}
