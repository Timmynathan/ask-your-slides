// Line icons for course cards, from Lucide like the rest of the app (owner, 22 Nov 2026: no
// hand-drawn icons), one weight, black (off-white in dark mode). Chosen by lib/study/course-icon.ts.
import { BookOpen, Code, Database, Globe, ListChecks, Lock, Palette, PenLine, RadioTower, Ruler, Scale, Sparkles, type LucideIcon } from "lucide-react";
import { courseIconId, type CourseIconId } from "@/lib/study/course-icon";

const ICONS: Record<CourseIconId, LucideIcon> = {
  scales: Scale,
  pen: PenLine,
  database: Database,
  signal: RadioTower,
  globe: Globe,
  checklist: ListChecks,
  code: Code,
  spark: Sparkles,
  lock: Lock,
  ruler: Ruler,
  palette: Palette,
  book: BookOpen,
};

export function CourseIcon({ title, size = 32, className = "", light = false }: { title: string; size?: number; className?: string; light?: boolean }) {
  const Icon = ICONS[courseIconId(title)];
  return <Icon size={size} absoluteStrokeWidth strokeWidth={1.5} aria-hidden className={`shrink-0 ${light ? "text-white" : "text-black dark:text-[#faf9f5]"} ${className}`} />;
}
