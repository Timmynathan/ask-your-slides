export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return v;
}

export function supabasePublishableKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  return v;
}

// PRD F1: a session lasts 30 days. Supabase refresh tokens don't expire on their own, so the
// cookie lifetime is what bounds the session; each refresh re-sets it (30 days since last use).
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// @supabase/ssr always writes auth cookies with a 400-day max-age and ignores
// cookieOptions.maxAge, so the lifetime is applied here, where cookies are written.
// Deletions (maxAge 0) pass through unchanged.
export function withSessionLifetime<T extends { maxAge?: number }>(options: T): T {
  return options.maxAge === 0 ? options : { ...options, maxAge: SESSION_MAX_AGE_SECONDS };
}
