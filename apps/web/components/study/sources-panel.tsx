"use client";

// Right panel: "Sources", the materials the study partner reads for this chat. A topic shows that
// topic's materials; Whole course shows everything, grouped by topic, then course-level materials
// (outline, other). A source opens in the slide viewer at its first page. On wide laptops it is a
// fixed panel; below xl it slides in from the right (Sources button in the chat header).
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
  courseCode: string;
  topics: TopicItem[];
  materials: MaterialItem[];
  topic: TopicItem | null;
  open: boolean; // below xl
  onClose(): void;
  onOpenSource(slideKey: string): void;
}

export function SourcesPanel({ courseCode, topics, materials, topic, open, onClose, onOpenSource }: Props) {
  const groups: { title: string | null; items: MaterialItem[] }[] = topic
    ? [{ title: null, items: materials.filter((m) => m.topic_id === topic.id) }]
    : [
        ...topics.map((t) => ({ title: `${t.order}. ${t.title}`, items: materials.filter((m) => m.topic_id === t.id) })),
        { title: "Course materials", items: materials.filter((m) => m.topic_id === null) },
      ].filter((g) => g.items.length > 0);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
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
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(340px,90vw)] transform flex-col bg-page transition-transform duration-200 ease-out xl:static xl:z-auto xl:w-[320px] xl:shrink-0 xl:translate-x-0 xl:overflow-hidden xl:rounded-[28px] xl:bg-sunken/60 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-5">
          <h2 className="text-[13px] text-muted">Sources</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5 xl:hidden" aria-label="Close sources">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((g) => (
            <section key={g.title ?? "topic"} className="mb-2">
              {g.title && <h3 className="px-3 pb-1 pt-4 text-[12px] text-muted">{g.title}</h3>}
              <ul className="space-y-0.5">
                {g.items.map((m) => {
                  const kind = KIND[m.kind] ?? KIND.other;
                  const unit = m.kind === "slides" ? (m.page_count === 1 ? "slide" : "slides") : m.page_count === 1 ? "page" : "pages";
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => open1(m)}
                        onPointerEnter={() => prefetchSlide(firstPage(m))}
                        onFocus={() => prefetchSlide(firstPage(m))}
                        className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-page active:scale-[0.99]"
                        title={`View ${m.title}`}
                      >
                        <svg className="mt-0.5 shrink-0 text-ink" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M7 3.5h7l4 4V20.5H7z" />
                          <path d="M14 3.5v4h4" />
                        </svg>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[14px] leading-snug text-ink">{m.title}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {kind} · {m.page_count} {unit}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {count === 0 && <p className="px-2 py-6 text-sm text-muted">No materials here yet.</p>}
        </div>
      </aside>
    </>
  );
}
