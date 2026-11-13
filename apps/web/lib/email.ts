// Transactional email through Resend's HTTP API (PRD F12: the owner on each new payment request,
// the student when Finals is approved). Sign-in codes are sent by Supabase, not here.
//
// RESEND_API_KEY is a server-only secret: Vercel env + apps/web/.env.local, never committed, never
// sent to the browser (no NEXT_PUBLIC_ prefix), never logged. Without it, emails are skipped
// (logged without content) and nothing else fails: a payment flow must not break over an email.
import "server-only";

export const EMAIL_FROM = "AskYourSlides <noreply@mail.askyourslides.com>";

export type EmailResult = { sent: true; id: string } | { sent: false; reason: "no_key" | "error" };

export async function sendEmail(
  msg: { to: string | string[]; subject: string; text: string; html?: string },
  opts: { key?: string; fetcher?: typeof fetch } = {},
): Promise<EmailResult> {
  const key = opts.key ?? process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`email skipped (RESEND_API_KEY not set): ${msg.subject}`);
    return { sent: false, reason: "no_key" };
  }
  try {
    const res = await (opts.fetcher ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!res.ok || !json?.id) {
      console.error(`email failed (${res.status}): ${msg.subject} ${json?.message ?? ""}`);
      return { sent: false, reason: "error" };
    }
    return { sent: true, id: json.id };
  } catch (e) {
    console.error(`email failed: ${msg.subject} ${(e as Error).message}`);
    return { sent: false, reason: "error" };
  }
}

/** Owner addresses (ADMIN_EMAILS, comma-separated). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
