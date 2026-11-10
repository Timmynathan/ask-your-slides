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

/** What the picker shows: short enough for a phone. "BSc ISMS" when the catalog gives a short name
 *  (the degree prefix kept: "BSc Information Science and Media Studies" → "BSc ISMS"), else the name. */
export function programmeLabel(p: Pick<ProgrammeChoice, "name" | "shortName">): string {
  if (!p.shortName) return p.name;
  const degree = p.name.match(/^(BSc|BA|BEng|BTech|MSc|MA|MBA|PhD)\b/)?.[1];
  return degree ? `${degree} ${p.shortName}` : p.shortName;
}

/** The full name, shown under the picker when the label is a short name ("Information Science and
 *  Media Studies"); null when the label already is the full name. */
export function programmeFullName(p: Pick<ProgrammeChoice, "name" | "shortName">): string | null {
  return p.shortName ? p.name.replace(/^(BSc|BA|BEng|BTech|MSc|MA|MBA|PhD)\s+/, "") : null;
}
