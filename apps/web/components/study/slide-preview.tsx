"use client";

import { useEffect, useState } from "react";

interface Preview {
  slide_key: string;
  slide_number: number;
  title: string | null;
  text: string | null;
  visual_description: string | null;
  image_url: string | null;
  material: { title: string; kind: string; page_count: number };
  topic: string | null;
}

interface Props {
  slideKey: string;
  sortOrder: number;
  onClose(): void;
  onAsk(text: string): void;
}

const KIND_LABEL: Record<string, string> = {
  slides: "Slides",
  notes: "Lecture notes",
  reading: "Reading",
  practical: "Practical",
  outline: "Course outline",
  other: "Other material",
};

// Side panel on laptops (next to the chat), bottom sheet on phones (PRD §13.1).
export function SlidePreview({ slideKey, onClose, onAsk }: Props) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    // One component per slide (keyed by slideKey in Workspace), so state starts empty here.
    let cancelled = false;
    fetch(`/api/slides/${slideKey}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? "Couldn't load this slide."))))
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [slideKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unit = data ? (data.material.kind === "slides" ? "slide" : "page") : "slide";

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Slide preview"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[75dvh] flex-col rounded-t-2xl border-t border-line bg-card shadow-xl lg:static lg:z-auto lg:h-auto lg:w-[440px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none xl:w-[520px]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{data?.material.title ?? "Loading…"}</p>
            {data && (
              <p className="truncate text-xs text-muted">
                {KIND_LABEL[data.material.kind] ?? data.material.kind} · {unit} {data.slide_number} of {data.material.page_count}
                {data.topic ? ` · ${data.topic}` : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-sunken" aria-label="Close preview">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          {!data && !error && <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-sunken" />}
          {data && (
            <>
              {data.image_url ? (
                // Signed, expiring Supabase URL (PRD §16); next/image would need a remote pattern per project.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.image_url}
                  alt={data.title ? `${unit} ${data.slide_number}: ${data.title}` : `${unit} ${data.slide_number}`}
                  className="w-full rounded-lg border border-line bg-card"
                />
              ) : (
                <p className="text-sm text-muted">No image for this {unit}.</p>
              )}
              <button
                onClick={() =>
                  onAsk(`Explain ${unit} ${data.slide_number} of "${data.material.title}"${data.title ? ` (${data.title})` : ""}: `)
                }
                className="mt-4 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink hover:opacity-90"
              >
                Ask about this {unit}
              </button>
              {(data.text || data.visual_description) && (
                <div className="mt-4">
                  <button onClick={() => setShowText((v) => !v)} className="text-xs font-medium text-muted underline-offset-2 hover:underline">
                    {showText ? "Hide" : "Show"} the {unit}&apos;s text
                  </button>
                  {showText && (
                    <div className="mt-2 whitespace-pre-wrap rounded-lg bg-page p-3 text-[13px] leading-relaxed text-ink/80">
                      {data.text}
                      {data.visual_description && (
                        <>
                          {"\n\n"}
                          <span className="font-medium">Image description: </span>
                          {data.visual_description}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
