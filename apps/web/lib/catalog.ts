import "server-only";
import { cacheLife } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";

// What's on offer, read from the database instead of written into the copy: departments, courses
// and slide counts change as content is ingested (more departments are planned).
export interface Catalog {
  departments: string[];
  courseCodes: string[];
  courseCount: number;
  slideCount: number;
}

export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheLife("hours");
  const db = adminClient();
  const [{ data: courses }, { count }] = await Promise.all([
    db.from("courses").select("code, department").order("sort_order"),
    db.from("slides").select("*", { count: "exact", head: true }),
  ]);
  const rows = (courses ?? []) as { code: string; department: string }[];
  return {
    departments: [...new Set(rows.map((c) => c.department))],
    courseCodes: rows.map((c) => c.code),
    courseCount: rows.length,
    slideCount: count ?? 0,
  };
}

/** "Computer Science" · "Computer Science and Accounting" · "Computer Science, Accounting and Law". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** 1504 → "1,500+"; 87 → "87". */
export function roughCount(n: number): string {
  if (n < 100) return String(n);
  const step = n < 1000 ? 50 : 100;
  return `${(Math.floor(n / step) * step).toLocaleString("en-US")}+`;
}

/** "CSC402" → "CSC 402". */
export function spacedCode(code: string): string {
  return code.replace(/^([A-Z]+)/, "$1 ");
}
