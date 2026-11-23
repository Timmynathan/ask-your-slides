import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { weeklyReport } from "@/lib/reports/weekly";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// The owner's weekly email (lib/reports/weekly.ts).
//   Vercel cron (vercel.json, Mondays 07:00 UTC = 08:00 Lagos) calls this with
//   "Authorization: Bearer <CRON_SECRET>": the report is emailed to ADMIN_EMAILS through Resend.
//   ?preview=1 while signed in as an admin: the report as a page, nothing sent.
export const maxDuration = 60;

const FROM = "Ask Your Slides <hello@askyourslides.com>";

export async function GET(request: Request) {
  const preview = new URL(request.url).searchParams.get("preview") === "1";
  if (preview) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user || !isAdminEmail(auth.user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const report = await weeklyReport(adminClient());
    return new Response(report.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const to = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const key = process.env.RESEND_API_KEY;
  if (!to.length || !key) return NextResponse.json({ error: "ADMIN_EMAILS or RESEND_API_KEY is not set." }, { status: 500 });

  const report = await weeklyReport(adminClient());
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject: report.subject, html: report.html, text: report.text }),
  });
  if (!res.ok) {
    console.error("weekly report: Resend", res.status, (await res.text()).slice(0, 300));
    return NextResponse.json({ error: "Couldn't send the report." }, { status: 502 });
  }
  return NextResponse.json({ sent: to.length });
}
