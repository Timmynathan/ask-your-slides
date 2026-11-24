import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { buildSignIn, sendEmail } from "@/lib/email/send";
import { adminClient } from "@/lib/supabase/admin";

// Supabase Auth "Send Email" hook (owner, 24 Nov 2026: sign-in codes in the same branded layout).
// Supabase still makes, checks and rate-limits the code; it calls this route instead of its own SMTP,
// and we send the code through Resend. Switched on in Supabase → Authentication → Hooks → Send Email
// (HTTPS, this URL); the secret it shows goes in Vercel as SEND_EMAIL_HOOK_SECRET.
// Signed with Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature ("v1,<base64>").

const TOLERANCE_S = 5 * 60;

function verify(body: string, headers: Headers): boolean {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) return false;
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const want = Buffer.from(createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64"));
  return sigs.split(" ").some((s) => {
    const got = Buffer.from(s.split(",")[1] ?? "");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

const fail = (status: number, message: string) => NextResponse.json({ error: { http_code: status, message } }, { status });

export async function POST(request: Request) {
  const body = await request.text();
  if (!verify(body, request.headers)) return fail(401, "Invalid signature");
  const payload = JSON.parse(body) as { user?: { id?: string; email?: string }; email_data?: { token?: string; email_action_type?: string } };
  const email = payload.user?.email;
  const code = payload.email_data?.token;
  if (!email || !code) return fail(400, "Missing email or code");
  const sent = await sendEmail(email, await buildSignIn(code), "signin");
  if (sent.error) {
    console.error("email hook: send failed", sent.error);
    return fail(502, "We couldn't send the code. Try again in a moment.");
  }
  // Logged for the retention numbers; a failed log never blocks the code.
  if (payload.user?.id) await adminClient().from("email_sends").insert({ user_id: payload.user.id, type: "signin", resend_id: sent.id }).then(() => null, () => null);
  return NextResponse.json({});
}
