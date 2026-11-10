"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlightLine, TOKEN_CLASS } from "@/lib/study/highlight";
import { loadSlide, pageKey, prefetchSlide, type SlidePreviewData, type SlideView } from "@/lib/study/slide-cache";

type Preview = SlidePreviewData;

interface Props {
  slideKey: string;
  courseId: string;
  sortOrder: number;
  onClose(): void;
  onAsk(text: string): void;
  /** Flip to another page of the same material (slide key with a different last number). */
  onNavigate?(slideKey: string): void;
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
export function SlidePreview({ slideKey, courseId, onClose, onAsk, onNavigate }: Props) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    // One component per material (keyed in Workspace): a new page replaces the old one once it arrives.
    let cancelled = false;
    loadSlide(courseId, slideKey)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        // Have the neighbouring pages ready before the student flips.
        if (d.slide_number < d.material.page_count) prefetchSlide(courseId, pageKey(slideKey, d.slide_number + 1));
        if (d.slide_number > 1) prefetchSlide(courseId, pageKey(slideKey, d.slide_number - 1));
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [courseId, slideKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Word sections, notebook cell groups and code parts are numbered like pages (PRD F11).
  const unit = !data
    ? "slide"
    : data.view?.type === "notebook"
      ? "cell group"
      : data.view?.type === "code"
        ? "part"
        : data.label
          ? "section"
          : data.material.kind === "slides"
            ? "slide"
            : "page";
  const kindLabel = data ? (data.material.source === "student" ? "Student presentation" : KIND_LABEL[data.material.kind] ?? data.material.kind) : "";

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Slide preview"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[75dvh] flex-col rounded-t-2xl border-t border-line bg-card shadow-xl lg:static lg:z-auto lg:h-auto lg:w-[440px] lg:shrink-0 lg:overflow-hidden lg:rounded-[28px] lg:border-0 lg:bg-sunken/60 lg:shadow-none xl:w-[520px]"
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{data?.material.title ?? "Loading…"}</p>
            {data && (
              <p className="truncate text-xs text-muted">
                {kindLabel} · {data.label ?? `${unit} ${data.slide_number} of ${data.material.page_count}`}
                {data.topic ? ` · ${data.topic}` : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5" aria-label="Close preview">
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
              {data.view ? (
                <SourceView view={data.view} />
              ) : data.image_url ? (
                // Signed, expiring Supabase URL (PRD §16); next/image would need a remote pattern per project.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.image_url}
                  alt={data.title ? `${unit} ${data.slide_number}: ${data.title}` : `${unit} ${data.slide_number}`}
                  className="w-full rounded-xl bg-card shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
                />
              ) : (
                <p className="text-sm text-muted">No image for this {unit}.</p>
              )}
              {onNavigate && data.material.page_count > 1 && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onNavigate(pageKey(slideKey, data.slide_number - 1))}
                    disabled={data.slide_number <= 1}
                    aria-label={`Previous ${unit}`}
                    className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-black/5 active:scale-90 disabled:opacity-30"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10 3 5 8l5 5" />
                    </svg>
                  </button>
                  <span className="text-xs text-muted">
                    {unit[0].toUpperCase() + unit.slice(1)} {data.slide_number} of {data.material.page_count}
                  </span>
                  <button
                    onClick={() => onNavigate(pageKey(slideKey, data.slide_number + 1))}
                    disabled={data.slide_number >= data.material.page_count}
                    aria-label={`Next ${unit}`}
                    className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-black/5 active:scale-90 disabled:opacity-30"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m6 3 5 5-5 5" />
                    </svg>
                  </button>
                </div>
              )}
              <button
                onClick={() =>
                  onAsk(
                    data.label
                      ? `Explain ${data.label} of "${data.material.title}": `
                      : `Explain ${unit} ${data.slide_number} of "${data.material.title}"${data.title ? ` (${data.title})` : ""}: `,
                  )
                }
                className="mt-4 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink hover:opacity-90"
              >
                Ask about this {unit}
              </button>
              {!data.view && (data.text || data.visual_description) && (
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

/** A notebook's cells (like Jupyter) or a code file's lines, with line numbers and highlighting. */
function SourceView({ view }: { view: SlideView }) {
  if (view.type === "code") {
    const width = String(view.start + view.lines.length - 1).length;
    return (
      <pre className="overflow-x-auto rounded-xl bg-card p-3 font-mono text-[12.5px] leading-[1.55] shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
        {view.lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="mr-3 shrink-0 select-none text-right text-muted/70" style={{ width: `${width}ch` }}>
              {view.start + i}
            </span>
            <Code line={line} language={view.language} />
          </div>
        ))}
      </pre>
    );
  }
  return (
    <div className="space-y-2">
      {view.cells.map((c) => (
        <div key={c.n} className="flex gap-2">
          <span className="w-12 shrink-0 pt-2 text-right font-mono text-[11px] text-muted/80">{c.type === "code" ? `[${c.n}]` : c.n}</span>
          <div className="min-w-0 flex-1">
            {c.type === "code" ? (
              <>
                <pre className="overflow-x-auto rounded-lg bg-card p-2.5 font-mono text-[12.5px] leading-[1.5] ring-1 ring-line">
                  {c.source.split("\n").map((line, i) => (
                    <div key={i}>
                      <Code line={line} language="python" />
                    </div>
                  ))}
                </pre>
                {c.output && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap px-2.5 font-mono text-[12px] text-ink/70">{c.output}</pre>}
              </>
            ) : (
              <div className="text-[13.5px] leading-relaxed text-ink [&_h1]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:my-1.5 [&_ul]:list-disc">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.source}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Code({ line, language }: { line: string; language: string }) {
  if (!line) return <span>{"\u00a0"}</span>;
  return (
    <span className="whitespace-pre">
      {highlightLine(line, language).map((t, i) => (
        <span key={i} className={TOKEN_CLASS[t.kind]}>
          {t.text}
        </span>
      ))}
    </span>
  );
}
