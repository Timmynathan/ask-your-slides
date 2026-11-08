"use client";

// Right panel: "Sources", the materials the study partner reads for this chat. A topic shows that
// topic's materials; Whole course shows everything, grouped by topic, then course-level materials
// (outline, other). A source opens in the slide viewer at its first page. On wide laptops it is a
// fixed panel; below xl it slides in from the right (Sources button in the chat header).
import type { MaterialItem, TopicItem } from "@/lib/study/types";

const KIND: Record<string, { label: string; tone: string }> = {
  slides: { label: "Slides", tone: "bg-pau-100 text-brand" },
  notes: { label: "Lecture notes", tone: "bg-sky-100 text-sky-800" },
  reading: { label: "Reading", tone: "bg-amber-100 text-amber-800" },
  practical: { label: "Practical", tone: "bg-emerald-100 text-emerald-800" },
  outline: { label: "Course outline", tone: "bg-violet-100 text-violet-800" },
  other: { label: "Other", tone: "bg-sunken text-muted" },
};

interface Props {
  courseCode: string;
  topics: TopicItem[];
  materials: MaterialItem[];
  topic: TopicItem | null;
  partnerName: string;
  open: boolean; // below xl
  onClose(): void;
  onOpenSource(slideKey: string): void;
}

export function SourcesPanel({ courseCode, topics, materials, topic, partnerName, open, onClose, onOpenSource }: Props) {
  const groups: { title: string | null; items: MaterialItem[] }[] = topic
    ? [{ title: null, items: materials.filter((m) => m.topic_id === topic.id) }]
    : [
        ...topics.map((t) => ({ title: `${t.order}. ${t.title}`, items: materials.filter((m) => m.topic_id === t.id) })),
        { title: "Course materials", items: materials.filter((m) => m.topic_id === null) },
      ].filter((g) => g.items.length > 0);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const open1 = (m: MaterialItem) => onOpenSource(`${courseCode}-${String(m.material_order).padStart(2, "0")}-1`);

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity xl:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label="Sources"
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(360px,90vw)] transform flex-col bg-card transition-transform duration-200 ease-out xl:static xl:z-auto xl:w-[340px] xl:shrink-0 xl:translate-x-0 xl:overflow-hidden xl:rounded-[24px] xl:ring-1 xl:ring-line ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-5">
          <h2 className="text-[16px] font-medium text-ink">Sources</h2>
          <span className="text-xs text-muted">{count}</span>
          <button onClick={onClose} className="ml-auto rounded-full p-1.5 text-muted hover:bg-sunken xl:hidden" aria-label="Close sources">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="-mt-2 px-5 pb-3 text-[13px] leading-snug text-muted">
          What {partnerName} reads for {topic ? <span className="text-ink">{topic.title}</span> : "the whole course"}.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((g) => (
            <section key={g.title ?? "topic"} className="mb-2">
              {g.title && <h3 className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted">{g.title}</h3>}
              <ul className="space-y-0.5">
                {g.items.map((m) => {
                  const kind = KIND[m.kind] ?? KIND.other;
                  const unit = m.kind === "slides" ? (m.page_count === 1 ? "slide" : "slides") : m.page_count === 1 ? "page" : "pages";
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => open1(m)}
                        className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-sunken active:scale-[0.99]"
                        title={`View ${m.title}`}
                      >
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${kind.tone}`} aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                            <path d="M4 1.5h5.5L12.5 4.5v10h-8.5z" />
                            <path d="M9.5 1.5v3h3M6 8h4.5M6 10.5h4.5" strokeLinecap="round" />
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-[14px] leading-snug text-ink">{m.title}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {kind.label} · {m.page_count} {unit}
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
