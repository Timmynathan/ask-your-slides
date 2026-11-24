import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cronToken } from "@/lib/email/send";
import { runEmailQueue } from "@/lib/email/queue";
import { adminClient } from "@/lib/supabase/admin";

// GET /api/cron/emails, every hour from .github/workflows/emails.yml ("Authorization: Bearer <token>",
// an HMAC of the secret key, so no new secret is needed): queues welcome emails and sends the queue
// within the daily and weekly limits (lib/email/queue.ts). Vercel's own CRON_SECRET is accepted too.
export const maxDuration = 60;

function allowed(header: string | null): boolean {
  const got = Buffer.from(header ?? "");
  for (const t of [cronToken(), process.env.CRON_SECRET].filter(Boolean) as string[]) {
    const want = Buffer.from(`Bearer ${t}`);
    if (want.length === got.length && timingSafeEqual(want, got)) return true;
  }
  return false;
}

export async function GET(request: Request) {
  if (!allowed(request.headers.get("authorization"))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const result = await runEmailQueue(adminClient());
  return NextResponse.json(result);
}
