// Study streaks (owner, 22 Nov 2026): Lagos days in a row with at least one question asked. They come
// from usage_daily (one row per student per Lagos day with questions), so the dashboard card and the
// leaderboard always agree.
import { lagosDay } from "@/lib/plans/limits";

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" one Lagos day before `day`. */
function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return new Date(d.getTime() - DAY_MS).toISOString().slice(0, 10);
}

/** Days in a row ending today, or ending yesterday when today has no question yet (still alive). */
export function currentStreak(days: Set<string>, now: Date): number {
  const today = lagosDay(now);
  let d = days.has(today) ? today : dayBefore(today);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = dayBefore(d);
  }
  return n;
}

/** The longest run of days in a row, ever. */
export function longestStreak(days: Set<string>): number {
  let best = 0;
  for (const day of days) {
    if (days.has(dayBefore(day))) continue; // not the start of a run
    let n = 0;
    let d = day;
    while (days.has(d)) {
      n++;
      d = new Date(new Date(`${d}T12:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
    }
    best = Math.max(best, n);
  }
  return best;
}

/** "Timilehin I." from a display name, else the first part of the email ("lesley.casca" → "Lesley"). */
export function boardName(displayName: string | null, email: string | null): string {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${cap(parts[0])} ${parts.at(-1)![0].toUpperCase()}.`;
  if (parts.length === 1) return cap(parts[0]);
  return cap((email ?? "").split("@")[0].split(/[._-]/)[0] || "Student");
}

const cap = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);

export interface BoardRow {
  userId: string;
  name: string;
  partner: string | null;
  programme: string | null;
  current: number;
  best: number;
}

/** Every student's current and longest streak, for the leaderboard. Reads usage_daily with the service
 *  role (it holds every student's days), 1,000 rows a page. Admin accounts are left out. */
export async function loadStreakBoard(db: import("@supabase/supabase-js").SupabaseClient, now: Date): Promise<BoardRow[]> {
  const byUser = new Map<string, Set<string>>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("usage_daily").select("user_id, day").gt("message_count", 0).order("user_id").order("day").range(from, from + 999);
    if (error) throw new Error(`Couldn't load streaks: ${error.message}`);
    for (const r of (data ?? []) as { user_id: string; day: string }[]) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Set());
      byUser.get(r.user_id)!.add(r.day);
    }
    if (!data || data.length < 1000) break;
  }
  const ids = [...byUser.keys()];
  const profiles: { id: string; display_name: string | null; email: string | null; study_partner: string | null; programme: string | null; show_on_leaderboard?: boolean }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    // show_on_leaderboard arrives with migration 20261122000001; until then everyone is shown.
    const withFlag = await db.from("profiles").select("id, display_name, email, study_partner, programme, show_on_leaderboard").in("id", chunk);
    const rows = withFlag.error ? (await db.from("profiles").select("id, display_name, email, study_partner, programme").in("id", chunk)).data : withFlag.data;
    profiles.push(...((rows ?? []) as typeof profiles));
  }
  const admins = new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
  return profiles
    .filter((p) => !admins.has((p.email ?? "").toLowerCase()) && p.show_on_leaderboard !== false)
    .map((p) => {
      const days = byUser.get(p.id)!;
      return { userId: p.id, name: boardName(p.display_name, p.email), partner: p.study_partner, programme: p.programme, current: currentStreak(days, now), best: longestStreak(days) };
    });
}
