/** Where to go after sign-in: only paths inside this app (no "//evil.com", no full URLs), so a
 *  shared link like /study/CSC420 survives sign-in but can't be used to redirect elsewhere. */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/^\/(sign-in|welcome|api)(\/|\?|$)/.test(raw)) return null;
  return raw;
}
