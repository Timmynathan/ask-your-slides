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
