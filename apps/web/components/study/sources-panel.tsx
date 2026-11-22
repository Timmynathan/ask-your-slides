"use client";

// Right panel: "Sources", the materials the study partner reads for this chat. A topic shows that
// topic's materials; Whole course shows everything, grouped by topic, then course-level materials
// (outline, other). A source opens in the slide viewer at its first page. On wide laptops it is a
// fixed panel; below xl it slides in from the right (Sources button in the chat header).
import { useState } from "react";
import { ChevronRight, File, X } from "lucide-react";
import { prefetchSlide } from "@/lib/study/slide-cache";
import type { MaterialItem, TopicItem } from "@/lib/study/types";

const KIND: Record<string, string> = {
  slides: "Slides",
  notes: "Lecture notes",
  reading: "Reading",
  practical: "Practical",
  outline: "Course outline",
  other: "Other",
};

interface Props {
  courseId: string;
  courseCode: string;
  topics: TopicItem[];
  materials: MaterialItem[];
  topic: TopicItem | null;
  open: boolean; // below xl
  /** Laptops: dragged closed (a Sources button in the top bar opens it again). */
  collapsed?: boolean;
  onClose(): void;
  onOpenSource(slideKey: string): void;
}

export function SourcesPanel({ courseId, courseCode, topics, materials, topic, open, collapsed = false, onClose, onOpenSource }: Props) {
  const groups: { title: string | null; items: MaterialItem[] }[] = topic
    ? [{ title: null, items: materials.filter((m) => m.topic_id === topic.id) }]
    : [
        ...topics.map((t) => ({ title: `${t.order}. ${t.title}`, items: materials.filter((m) => m.topic_id === t.id) })),
        { title: "Course materials", items: materials.filter((m) => m.topic_id === null) },
      ].filter((g) => g.items.length > 0);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  // Whole course (owner, 22 Nov 2026: open by default, so keep it quiet): each lecture is one line,
  // folded; a click shows its files.
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const toggle = (t: string) =>
    setUnfolded((u) => {
      const n = new Set(u);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  const firstPage = (m: MaterialItem) => `${courseCode}-${String(m.material_order).padStart(2, "0")}-1`;
  const open1 = (m: MaterialItem) => onOpenSource(firstPage(m));

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/20 transition-opacity xl:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label="Sources"
        data-laptop-tour="sources"
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(340px,90vw)] transform flex-col bg-page transition-transform duration-200 ease-out xl:static xl:z-auto xl:w-[var(--sources-w,240px)] xl:shrink-0 ${collapsed ? "xl:hidden" : ""} xl:translate-x-0 xl:overflow-hidden xl:border-l xl:border-line xl:bg-sunken/60 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-5">
          <h2 className="text-[12px] text-muted">Sources</h2>
          {/* On every screen (owner, 22 Nov 2026): no dragging needed to close it on laptops. */}
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink" aria-label="Close sources" title="Close">
            <X size={16} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((g) => (
            <section key={g.title ?? "topic"} className={g.title ? "" : "mb-2"}>
              {g.title && (
                <h3>
                  <button
                    type="button"
                    onClick={() => toggle(g.title!)}
                    aria-expanded={unfolded.has(g.title)}
                    className="flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-left text-[12px] text-muted transition hover:bg-page hover:text-ink"
                  >
                    <ChevronRight size={14} absoluteStrokeWidth strokeWidth={1.5} className={`shrink-0 transition-transform ${unfolded.has(g.title) ? "rotate-90" : ""}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    <span className="shrink-0 tabular-nums text-muted/80">{g.items.length}</span>
                  </button>
                </h3>
              )}
              {(!g.title || unfolded.has(g.title)) && (
              <ul className="space-y-0.5">
                {g.items.map((m) => {
                  const kind = KIND[m.kind] ?? KIND.other;
                  const unit = materialUnit(m);
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => open1(m)}
                        onPointerEnter={() => prefetchSlide(courseId, firstPage(m))}
                        onFocus={() => prefetchSlide(courseId, firstPage(m))}
                        className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-page active:scale-[0.99]"
                        title={`View ${m.title}`}
                      >
                        <File size={18} absoluteStrokeWidth strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink" aria-hidden />
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[12px] leading-snug text-ink">{m.title}</span>
                          <span className="mt-0.5 block text-[12px] text-muted">
                            {kind} · {m.page_count} {unit}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              )}
            </section>
          ))}
          {count === 0 && <p className="px-2 py-6 text-sm text-muted">No materials here yet.</p>}
        </div>
      </aside>
    </>
  );
}

/** "16 slides", "14 sections" (Word), "4 cell groups" (notebook), "1 part" (code): PRD F11. */
function materialUnit(m: { kind: string; page_count: number; source_file?: string }): string {
  const ext = m.source_file?.split(".").pop()?.toLowerCase();
  const one = m.page_count === 1;
  if (ext === "docx") return one ? "section" : "sections";
  if (ext === "ipynb") return one ? "cell group" : "cell groups";
  if (ext === "cs") return one ? "part" : "parts";
  if (m.kind === "slides") return one ? "slide" : "slides";
  return one ? "page" : "pages";
}
