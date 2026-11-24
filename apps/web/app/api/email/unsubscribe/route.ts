import { NextResponse } from "next/server";
import { validUnsubscribe } from "@/lib/email/send";
import { adminClient } from "@/lib/supabase/admin";

// POST /api/email/unsubscribe?u=<user id>&t=<token> (no login). Two callers:
//  - mail apps' one-click unsubscribe (List-Unsubscribe-Post, RFC 8058): turns update emails off;
//  - the /unsubscribe page's button (a form): off, or back on with action=resubscribe, then back to the page.
// GET never changes anything: link scanners (Outlook Safe Links, used by many schools) open every link.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(u) || !validUnsubscribe(u, t)) return NextResponse.json({ error: "This link isn't valid." }, { status: 400 });
  const resubscribe = url.searchParams.get("action") === "resubscribe";
  const { error } = await adminClient()
    .from("profiles")
    .update(resubscribe ? { email_updates: true, email_unsubscribed_at: null } : { email_updates: false, email_unsubscribed_at: new Date().toISOString() })
    .eq("id", u);
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  if ((request.headers.get("content-type") ?? "").includes("form") && url.searchParams.get("from") === "page") {
    return NextResponse.redirect(new URL(`/unsubscribe?u=${u}&t=${encodeURIComponent(t)}&done=${resubscribe ? "on" : "off"}`, url), 303);
  }
  return NextResponse.json({ ok: true });
}
