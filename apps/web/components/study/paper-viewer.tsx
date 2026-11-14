"use client";

// The original past paper, beside the questions (PRD F10, owner 14 Nov 2026): cleaned page images
// (ingestion/past_pages.py), always in view while past questions are open. Laptops: the left half of
// the past-questions area, pages stacked and scrollable. Phones: a strip above the questions, pages
// side by side to swipe. Tap a page to read it full screen, where it can be zoomed.
import { useEffect, useRef, useState } from "react";

interface Page {
  n: number;
  url: string;
}

const cache = new Map<string, Promise<Page[]>>();
function loadPages(paperId: string): Promise<Page[]> {
  if (!cache.has(paperId)) {
    const p = fetch(`/api/past/paper/${paperId}`)
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((d: { pages?: Page[] }) => d.pages ?? []);
    p.catch(() => cache.delete(paperId));
    cache.set(paperId, p);
  }
  return cache.get(paperId)!;
}

/** Calls onReady(false) when the paper has no cleaned pages, so the panel can use the full width. */
export function PaperViewer({ paperId, label, onReady }: { paperId: string; label: string; onReady?(hasPages: boolean): void }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const [zoomed, setZoomed] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    loadPages(paperId).then((p) => {
      if (!live) return;
      setPages(p);
      onReady?.(p.length > 0);
    });
    return () => {
      live = false;
    };
  }, [paperId, onReady]);

  if (pages && pages.length === 0) return null;
  return (
    <section aria-label={`Original paper: ${label}`} className="flex min-h-0 flex-col">
      <p className="shrink-0 px-1 pb-2 text-[12.5px] text-muted">
        <span className="font-medium text-ink">{label}</span>
        {pages && ` · ${pages.length} page${pages.length === 1 ? "" : "s"}`}
      </p>
      {/* Phones: swipe sideways; laptops: scroll down. */}
      <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-2 lg:snap-none lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-6">
        {!pages
          ? Array.from({ length: 2 }, (_, i) => <div key={i} className="aspect-[1/1.414] h-full shrink-0 animate-pulse rounded-xl bg-sunken lg:h-auto lg:w-full" />)
          : pages.map((p, i) => (
              <button
                key={p.n}
                type="button"
                onClick={() => setZoomed(i)}
                className="group relative h-full shrink-0 snap-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line transition hover:ring-line-strong lg:h-auto lg:w-full"
                aria-label={`Page ${i + 1}: open full screen`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs, already sized WebP */}
                <img src={p.url} alt={`${label}, page ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} className="h-full w-auto max-w-none select-none lg:h-auto lg:w-full lg:max-w-full" draggable={false} />
                <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
                  {i + 1}/{pages.length}
                </span>
              </button>
            ))}
      </div>
      {zoomed !== null && pages && <FullScreen pages={pages} start={zoomed} label={label} onClose={() => setZoomed(null)} />}
    </section>
  );
}

/** Full-screen reader: one page at a time, arrows/swipe between pages, tap to zoom in. */
function FullScreen({ pages, start, label, onClose }: { pages: Page[]; start: number; label: string; onClose(): void }) {
  const [i, setI] = useState(start);
  const [big, setBig] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(pages.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [pages.length, onClose]);

  const touchX = useRef<number | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label}, page ${i + 1} of ${pages.length}`}
      className="fade-in fixed inset-0 z-50 flex flex-col bg-black/90"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null || big) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx < -50) setI((x) => Math.min(pages.length - 1, x + 1));
        if (dx > 50) setI((x) => Math.max(0, x - 1));
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 px-4 text-white">
        <p className="min-w-0 flex-1 truncate text-[14px]">
          {label} · page {i + 1} of {pages.length}
        </p>
        <button type="button" onClick={onClose} autoFocus className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto ${big ? "" : "grid place-items-center"} px-3 pb-3`} onClick={() => setBig((b) => !b)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs */}
        <img
          key={pages[i].n}
          src={pages[i].url}
          alt={`${label}, page ${i + 1}`}
          className={`mx-auto rounded-lg bg-white ${big ? "w-[200%] max-w-none cursor-zoom-out sm:w-[160%]" : "max-h-full max-w-full cursor-zoom-in object-contain"}`}
        />
      </div>
      {pages.length > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-3 pb-5">
          <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30">
            ← Previous
          </button>
          <button type="button" disabled={i === pages.length - 1} onClick={() => setI(i + 1)} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-30">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
