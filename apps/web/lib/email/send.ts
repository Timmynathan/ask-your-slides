import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { render } from "@react-email/components";
import { createElement } from "react";
import { NewSlidesEmail, PastQuestionsEmail, SignInEmail, SITE, TEAM, WelcomeEmail } from "./templates";

// Sending through the existing Resend setup (owner, 24 Nov 2026). Every email: from "The AskYourSlides
// Team", replies to EMAIL_REPLY_TO (default hello@askyourslides.com, the inbox the owner already reads),
// HTML plus a plain-text version. Update emails carry List-Unsubscribe headers (one click, RFC 8058).

export const FROM = `${TEAM} <noreply@mail.askyourslides.com>`;
export const REPLY_TO = process.env.EMAIL_REPLY_TO || "hello@askyourslides.com";

export type UpdateType = "welcome" | "pastq" | "newslides";
export type EmailType = "signin" | UpdateType;
export const UPDATE_TYPES: UpdateType[] = ["welcome", "pastq", "newslides"];

// ── Unsubscribe tokens: HMAC of the user id, no login needed, no new secret to set. ────────────────
function unsubKey(): string {
  const k = process.env.SUPABASE_SECRET_KEY;
  if (!k) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createHmac("sha256", k).update("email-unsubscribe-v1").digest("hex");
}
export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", unsubKey()).update(userId).digest("base64url").slice(0, 32);
}
export function validUnsubscribe(userId: string, token: string): boolean {
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(String(token));
  return want.length === got.length && timingSafeEqual(want, got);
}
/** The page a student opens from the footer link (one button, works without login). */
export const unsubscribePage = (userId: string) => `${SITE}/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;
/** The one-click endpoint mail apps call (List-Unsubscribe-Post). */
export const unsubscribeEndpoint = (userId: string) => `${SITE}/api/email/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;

/** The token the hourly email job sends (GitHub Actions computes the same HMAC of the secret key). */
export function cronToken(): string {
  const k = process.env.SUPABASE_SECRET_KEY;
  if (!k) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createHmac("sha256", k).update("email-cron").digest("hex");
}

// ── Building the emails ──────────────────────────────────────────────────────────────────────────

export interface Built {
  subject: string;
  html: string;
  text: string;
  /** Update emails only. */
  unsubscribe?: { page: string; endpoint: string };
}

export interface UpdateData {
  userId: string;
  name: string | null;
  /** Course pages: code, programme, title. */
  course?: { code: string; programme: string; title: string } | null;
}

const firstName = (name: string | null) => (name?.trim() ? name.trim().split(/\s+/)[0] : null);
const tagged = (path: string, type: string) => `${SITE}${path}${path.includes("?") ? "&" : "?"}ref=email-${type}`;

export function courseUrl(course: { code: string; programme: string }, type: UpdateType, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ programme: course.programme, ...extra });
  return tagged(`/study/${encodeURIComponent(course.code)}?${q}`, type);
}

async function both(el: React.ReactElement) {
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text };
}

export async function buildSignIn(code: string): Promise<Built> {
  return { subject: `Your AskYourSlides code: ${code}`, ...(await both(createElement(SignInEmail, { code }))) };
}

export async function buildUpdate(type: UpdateType, d: UpdateData): Promise<Built> {
  const unsubscribe = { page: unsubscribePage(d.userId), endpoint: unsubscribeEndpoint(d.userId) };
  const name = firstName(d.name);
  if (type === "welcome") {
    return { subject: "Your courses are ready on AskYourSlides", unsubscribe, ...(await both(createElement(WelcomeEmail, { name, url: tagged("/dashboard", type), unsubscribeUrl: unsubscribe.page }))) };
  }
  if (!d.course) throw new Error(`${type} email needs a course`);
  const label = `${d.course.code.replace(/^([A-Z]{3})(\d)/, "$1 $2")} ${d.course.title}`;
  if (type === "pastq") {
    return {
      subject: `Past questions are live for ${d.course.title}`,
      unsubscribe,
      ...(await both(createElement(PastQuestionsEmail, { name, course: label, url: courseUrl(d.course, type, { past: "1" }), unsubscribeUrl: unsubscribe.page }))),
    };
  }
  return {
    subject: `New slides in ${d.course.title}`,
    unsubscribe,
    ...(await both(createElement(NewSlidesEmail, { name, course: label, url: courseUrl(d.course, type), unsubscribeUrl: unsubscribe.page }))),
  };
}

// ── Sending ──────────────────────────────────────────────────────────────────────────────────────

export async function sendEmail(to: string, email: Built, tag: string): Promise<{ id: string | null; error: string | null }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { id: null, error: "RESEND_API_KEY is not set" };
  const headers: Record<string, string> = {};
  if (email.unsubscribe) {
    headers["List-Unsubscribe"] = `<${email.unsubscribe.endpoint}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: email.subject, html: email.html, text: email.text, headers, tags: [{ name: "type", value: tag }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { id: null, error: `Resend ${res.status}: ${body.message ?? "error"}` };
    return { id: body.id ?? null, error: null };
  } catch (e) {
    return { id: null, error: String(e) };
  }
}
