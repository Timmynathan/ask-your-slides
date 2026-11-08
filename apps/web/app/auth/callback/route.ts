import { NextResponse } from "next/server";
import { isPauEmail } from "@/lib/auth/email";
import { safeNext } from "@/lib/auth/next";
import { createClient } from "@/lib/supabase/server";

// Microsoft sends the student back here with a one-time code: swap it for a session, then go to
// onboarding (first time), My courses, or the link they came from. Any failure lands on sign-in
// with a plain explanation, never a blank error page.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/sign-in?error=${reason}`, url.origin), { status: 303 });

  // Microsoft or Supabase refused (e.g. a non-PAU account was stopped by the auth hook, or the
  // student cancelled). The description is logged, not shown.
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    console.error("Microsoft sign-in returned an error", providerError);
    return fail(/pau email/i.test(providerError) ? "not_pau" : "microsoft");
  }

  const code = url.searchParams.get("code");
  if (!code) return fail("microsoft");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("exchangeCodeForSession failed", error?.message);
    return fail("microsoft");
  }
  // Belt and braces: the hook already refuses non-PAU sign-ups.
  if (!isPauEmail(data.user.email ?? "")) {
    await supabase.auth.signOut({ scope: "local" });
    return fail("not_pau");
  }

  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", data.user.id).single();
  const target = !profile?.onboarded ? `/welcome${next ? `?next=${encodeURIComponent(next)}` : ""}` : next ?? "/dashboard";
  return NextResponse.redirect(new URL(target, url.origin), { status: 303 });
}
