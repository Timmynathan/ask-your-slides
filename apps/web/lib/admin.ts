import "server-only";

/** Owner emails allowed to open /admin, from ADMIN_EMAILS (comma-separated). Empty → nobody. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export { RANGES, rangeStart, type Overview, type Range } from "./admin-shared";
