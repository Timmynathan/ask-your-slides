// Course codes and the keys built from them. A code is real (CSC420, GET501) or a placeholder for a
// course the LMS shows no code for (IOH-ETHICS, BUA-COMPANY-LAW; course.yaml code_confirmed: false).
// Placeholder parts start with a letter, so CODE-<order>-<number> still splits unambiguously.
// Keep in step with ingestion/manifest.py (CODE_RE) and migration 20261112000001.

export const CODE = "[A-Z]{2,4}(?:\\d{3}|(?:-[A-Z][A-Z0-9]*)+)";
/** CSC420-02-12 / IOH-ETHICS-03-12 → [, code, order, number]. */
export const SLIDE_KEY_RE = new RegExp(`^(${CODE})-(\\d{2,3})-(\\d{1,3})$`);
/** CSC420-02 / IOH-ETHICS-03 → [, code, order]. */
export const MATERIAL_KEY_RE = new RegExp(`^(${CODE})-(\\d{2,3})$`);

export function parseSlideKey(key: string): { code: string; order: string; number: number; material: string } | null {
  const m = key.match(SLIDE_KEY_RE);
  return m ? { code: m[1], order: m[2], number: Number(m[3]), material: `${m[1]}-${m[2]}` } : null;
}

export function parseMaterialKey(key: string): { code: string; order: number } | null {
  const m = key.match(MATERIAL_KEY_RE);
  return m ? { code: m[1], order: Number(m[2]) } : null;
}

/** "CSC402" → "CSC 402"; a placeholder code is returned as is (it is never shown to students). */
export function displayCode(code: string): string {
  return /^[A-Z]{2,4}\d{3}$/.test(code) ? code.replace(/^([A-Z]+)/, "$1 ") : code;
}

export interface NamedCourse {
  code: string;
  title: string;
  code_confirmed?: boolean | null;
}

/** The code students see, or null for a placeholder code (the UI shows only the title then). */
export function shownCode(c: Pick<NamedCourse, "code" | "code_confirmed">): string | null {
  return c.code_confirmed === false ? null : displayCode(c.code);
}

/** A short name for the course: "CSC 402", or the title when the code is a placeholder. */
export function courseName(c: NamedCourse): string {
  return shownCode(c) ?? c.title;
}

/** "CSC 402 Compiler Construction", or just the title when the code is a placeholder. */
export function courseFullName(c: NamedCourse): string {
  const code = shownCode(c);
  return code ? `${code} ${c.title}` : c.title;
}

/** A course with fewer than this many main materials (slides or notes) is flagged "Limited materials". */
export const LIMITED_MAIN_MATERIALS = 4;
export const MAIN_KINDS = ["slides", "notes"] as const;

export function countMain(materials: { kind: string }[] | null | undefined): number {
  return (materials ?? []).filter((m) => (MAIN_KINDS as readonly string[]).includes(m.kind)).length;
}
