"use client";

// "Search the web": a separate box, distinct from the slide chat in the middle. It hands the question
// to the student's own ChatGPT, Claude or Google in a new tab (their account, their model, web
// access), so they never have to choose between this app and a general chatbot. Only the question and
// the course name leave the app; no slide content. The chosen engine is remembered per browser.
import { useEffect, useState } from "react";

const ENGINES = {
  chatgpt: { label: "ChatGPT", url: (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`, context: true },
  claude: { label: "Claude", url: (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}`, context: true },
  google: { label: "Google", url: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`, context: false },
} as const;
type Engine = keyof typeof ENGINES;
const KEY = "ays:web-engine";

export function WebSearchBox({ courseLabel, topicTitle }: { courseLabel: string; topicTitle: string | null }) {
  const [q, setQ] = useState("");
  const [engine, setEngine] = useState<Engine>("chatgpt");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    if (saved && saved in ENGINES) {
      const id = setTimeout(() => setEngine(saved as Engine), 0);
      return () => clearTimeout(id);
    }
  }, []);

  const go = () => {
    const question = q.trim();
    if (!question) return;
    const e = ENGINES[engine];
    const full = e.context ? `${question}\n\n(For context: I'm a university student studying ${courseLabel}${topicTitle ? `, topic "${topicTitle}"` : ""}.)` : question;
    window.open(e.url(full), "_blank", "noopener,noreferrer");
    setQ("");
  };

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        go();
      }}
      className="rounded-2xl bg-sunken p-2.5"
      aria-label="Search the web"
    >
      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
        rows={2}
        placeholder="Search the web for anything else"
        aria-label="Search the web"
        className="block w-full resize-none bg-transparent px-1.5 py-1 text-[14px] text-ink outline-none placeholder:text-muted"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <label className="relative flex items-center">
          <span className="sr-only">Search with</span>
          <svg className="pointer-events-none absolute left-2.5 text-muted" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <circle cx="8" cy="8" r="6.2" />
            <path d="M1.8 8h12.4M8 1.8c1.8 1.8 2.6 3.9 2.6 6.2S9.8 12.4 8 14.2C6.2 12.4 5.4 10.3 5.4 8S6.2 3.6 8 1.8Z" />
          </svg>
          <select
            value={engine}
            onChange={(e) => {
              const v = e.target.value as Engine;
              setEngine(v);
              try {
                localStorage.setItem(KEY, v);
              } catch {}
            }}
            className="h-8 appearance-none rounded-full bg-card py-0 pl-8 pr-7 text-[13px] text-ink ring-1 ring-line outline-none focus:ring-brand"
          >
            {(Object.keys(ENGINES) as Engine[]).map((k) => (
              <option key={k} value={k}>
                {ENGINES[k].label}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-2.5 text-muted" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="m2 3.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        <span className="flex-1" />
        <button
          type="submit"
          disabled={!q.trim()}
          aria-label={`Search with ${ENGINES[engine].label}`}
          title={`Search with ${ENGINES[engine].label} (opens a new tab)`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card text-ink ring-1 ring-line transition hover:bg-pau-50 active:scale-90 disabled:opacity-40"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>
    </form>
  );
}
