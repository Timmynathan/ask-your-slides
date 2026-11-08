import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { updateSession } from "@/lib/supabase/proxy";

// Optimistic routing only. Every protected page also checks the user on the server.
const PUBLIC_PATHS = ["/manifest.webmanifest", "/sign-in", "/sign-up", "/auth/microsoft", "/auth/callback", "/api/auth/otp", "/api/auth/verify", "/api/auth/password", "/api/auth/signup"];

export async function proxy(request: NextRequest) {
  const { response, userId, email } = await updateSession(request);
  const { pathname } = request.nextUrl;
  // /admin doesn't exist for anyone but the owner: a real 404 before any rendering (signed in or
  // not). The page checks again on the server.
  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && !isAdminEmail(email)) {
    return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  // "/" is the landing page for visitors; signed-in students go straight to their courses.
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
  if (userId && (pathname === "/sign-in" || pathname === "/sign-up" || pathname === "/")) {
    return redirectKeepingCookies(new URL("/dashboard", request.url), response);
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
