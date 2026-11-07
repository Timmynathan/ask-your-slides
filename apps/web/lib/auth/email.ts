// Must stay identical to public.is_pau_email() in supabase/migrations (the auth hook uses that).
const PAU_EMAIL = /^[a-z0-9._%+'-]+@pau\.edu\.ng$/;

export const PAU_EMAIL_ERROR = "Use your PAU email.";

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isPauEmail(raw: unknown): boolean {
  return PAU_EMAIL.test(normalizeEmail(raw));
}

export function isOtpCode(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d{6,10}$/.test(raw.trim());
}

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72; // bcrypt (Supabase Auth) ignores bytes beyond 72

export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (new TextEncoder().encode(raw).length > MAX_PASSWORD) return "That password is too long.";
  return null;
}
