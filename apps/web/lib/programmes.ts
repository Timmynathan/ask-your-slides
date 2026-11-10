// Programmes a student can choose (PRD F11): only those in catalog.yaml with courses in the app.
// Nothing here names a programme: they come from the database (programme_choices()).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProgrammeChoice {
  programme: string; // id, e.g. computer-science
  name: string; // BSc Computer Science
  shortName: string | null; // ISMS
  department: string; // Computer Science
  levels: number[]; // [400]
}

/** Grouped and in catalog order. Runs as the signed-in student (security-definer RPC: every choice,
 *  not just the student's own programme). */
export async function programmeChoices(supabase: SupabaseClient): Promise<ProgrammeChoice[]> {
  const { data, error } = await supabase.rpc("programme_choices");
  if (error) throw new Error(`Couldn't load programmes: ${error.message}`);
  return groupChoices((data ?? []) as { programme: string; name: string; short_name: string | null; department: string; level: number }[]);
}

export function groupChoices(rows: { programme: string; name: string; short_name: string | null; department: string; level: number }[]): ProgrammeChoice[] {
  const out: ProgrammeChoice[] = [];
  for (const r of rows) {
    let p = out.find((x) => x.programme === r.programme);
    if (!p) out.push((p = { programme: r.programme, name: r.name, shortName: r.short_name, department: r.department, levels: [] }));
    if (!p.levels.includes(r.level)) p.levels.push(r.level);
  }
  for (const p of out) p.levels.sort((a, b) => a - b);
  return out;
}

/** "BSc Information Science and Media Studies (ISMS)". */
export function programmeLabel(p: Pick<ProgrammeChoice, "name" | "shortName">): string {
  return p.shortName ? `${p.name} (${p.shortName})` : p.name;
}
