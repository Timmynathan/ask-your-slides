import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { safeNext } from "@/lib/auth/next";
import { updateSession } from "@/lib/supabase/proxy";

// Optimistic routing only. Every protected page also checks the user on the server.
const PUBLIC_PATHS = ["/live", "/manifest.webmanifest", "/sign-in", "/sign-up", "/auth/microsoft", "/auth/callback", "/api/auth/otp", "/api/auth/verify", "/api/auth/password", "/api/auth/signup"];

export async function proxy(request: NextRequest) {
  const { response, userId, email } = await updateSession(request);
  const { pathname } = request.nextUrl;
  // /admin doesn't exist for anyone but the owner: a real 404 before any rendering (signed in or
  // not). The page checks again on the server.
  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !isAdminEmail(email)) {
    return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  // /live/<token> (ambassadors' count): a wrong or missing token is a plain 404 too. The page checks again.
  if (pathname === "/live" || pathname.startsWith("/live/")) {
    const want = process.env.LIVE_COUNT_TOKEN ?? "";
    if (want.length < 16 || pathname !== `/live/${want}`) {
      return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
  }
  // "/" is the landing page, open to everyone (owner, 17 Nov 2026: signed-in students can go back to
  // it from the dashboard logo; its buttons then lead to the dashboard).
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!userId && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    // Keep where they were going, so a shared course link survives sign-in.
    const target = new URL("/sign-in", request.url);
    if (pathname !== "/dashboard") target.searchParams.set("next", pathname + request.nextUrl.search);
    return redirectKeepingCookies(target, response);
  }
  // Already signed in: skip the form, but keep where they were going (e.g. the landing page's
  // "Lock in Finals" is /sign-up?next=/pay, and the landing page is open to signed-in students).
  if (userId && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const next = safeNext(request.nextUrl.searchParams.get("next")) ?? "/dashboard";
    return redirectKeepingCookies(new URL(next, request.url), response);
  }
  return response;
}

function redirectKeepingCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export const config = {
  // Everything except static files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
