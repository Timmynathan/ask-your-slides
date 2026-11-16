import "server-only";
import { timingSafeEqual } from "node:crypto";
import { adminClient, must } from "@/lib/supabase/admin";

// The ambassadors' live count (/live/<token>): how many students signed up, and how many per
// department. Counts only: no names, emails or usage. The link is the secret (LIVE_COUNT_TOKEN);
// no token set, or a wrong one, means the page does not exist.

export function liveTokenOk(token: string): boolean {
  const want = process.env.LIVE_COUNT_TOKEN ?? "";
  if (want.length < 16) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface LiveCount {
  signedUp: number;
  settingUp: number; // signed up, programme not picked yet
  departments: { name: string; n: number }[];
  at: string;
}

/** Same definitions as the admin overview: every profile counts as signed up; departments come
 *  from the programme picked in onboarding. Every department in the catalog is listed, even at 0. */
export async function liveCount(): Promise<LiveCount> {
  const db = adminClient();
  const [profiles, programmes] = await Promise.all([
    db.from("profiles").select("department, onboarded").range(0, 49_999), // past the 1,000-row default
    db.from("programmes").select("department"),
  ]);
  const rows = must(profiles) as { department: string | null; onboarded: boolean }[];
  const counts = new Map<string, number>();
  for (const p of must(programmes) as { department: string }[]) counts.set(p.department, 0);
  let settingUp = 0;
  for (const r of rows) {
    if (!r.onboarded || !r.department) settingUp++;
    else counts.set(r.department, (counts.get(r.department) ?? 0) + 1);
  }
  const departments = [...counts].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return { signedUp: rows.length, settingUp, departments, at: new Date().toISOString() };
}
