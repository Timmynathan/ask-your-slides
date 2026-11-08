import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/next";
import { createClient } from "@/lib/supabase/server";

// "Continue with Microsoft": students sign in with their PAU Microsoft 365 account (the one they
// use for Outlook/Teams), so no emailed code is needed. Supabase's Azure provider does the OAuth
// (PKCE: the verifier is stored in a cookie here and checked in /auth/callback). The database's
// before-user-created hook still refuses anything that isn't @pau.edu.ng.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const callback = new URL("/auth/callback", url.origin);
  if (next) callback.searchParams.set("next", next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: callback.toString(),
      scopes: "email openid profile",
      // Show the account picker, so a student signed into a personal Microsoft account can pick PAU.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("signInWithOAuth(azure) failed", error?.message);
    return NextResponse.redirect(new URL("/sign-in?error=microsoft", url.origin), { status: 303 });
  }
  return NextResponse.redirect(data.url, { status: 303 });
}
