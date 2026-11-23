// One icon per kind of material, used in the course's lecture list and in Sources (owner, 23 Nov 2026:
// "lectures should have a set icon, and other materials different icons, so they don't blend in").
// A lecture (slides or lecture notes) keeps the open book; readings, practicals, outlines and other
// files each get their own.
import { BookMarked, BookOpen, File, FlaskConical, ListChecks, type LucideIcon } from "lucide-react";
import type { MaterialItem } from "./types";

export const KIND_LABEL: Record<string, string> = {
  slides: "Slides",
  notes: "Lecture notes",
  reading: "Reading",
  practical: "Practical",
  outline: "Course outline",
  other: "Other",
};

export const KIND_ICON: Record<string, LucideIcon> = {
  slides: BookOpen,
  notes: BookOpen,
  reading: BookMarked,
  practical: FlaskConical,
  outline: ListChecks,
  other: File,
};

/** Which file of a lecture opens first, and which kind names the lecture: slides, then notes, then the rest. */
const PRIORITY = ["slides", "notes", "reading", "practical", "other", "outline"];
const rank = (kind: string) => {
  const i = PRIORITY.indexOf(kind);
  return i === -1 ? PRIORITY.length : i;
};

/** A topic's first material to open: its first slides, else lecture notes, else a reading, a practical… */
export function firstMaterial(materials: MaterialItem[], topicId: string): MaterialItem | null {
  return materials.filter((m) => m.topic_id === topicId).sort((a, b) => rank(a.kind) - rank(b.kind) || a.material_order - b.material_order)[0] ?? null;
}

/** The kind that names a topic in the lecture list (a lecture with slides and a reading is a lecture). */
export function topicKind(materials: MaterialItem[], topicId: string): string {
  return firstMaterial(materials, topicId)?.kind ?? "slides";
}
