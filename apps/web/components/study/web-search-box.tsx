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
      className="rounded-2xl bg-page px-3 pb-2 pt-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
      aria-label="Search the web"
    >
      <div className="flex items-center gap-2">
        <svg className="shrink-0 text-muted" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.2 2.2 3.3 4.9 3.3 8s-1.1 5.8-3.3 8c-2.2-2.2-3.3-4.9-3.3-8S9.8 6.2 12 4Z" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the web"
          aria-label="Search the web"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!q.trim()}
          aria-label={`Search with ${ENGINES[engine].label}`}
          title={`Search with ${ENGINES[engine].label} (opens a new tab)`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink transition hover:bg-sunken active:scale-90 disabled:opacity-30"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>
      <label className="ml-[25px] mt-1 inline-flex items-center gap-1 text-[12px] text-muted">
        with
        <select
          value={engine}
          onChange={(e) => {
            const v = e.target.value as Engine;
            setEngine(v);
            try {
              localStorage.setItem(KEY, v);
            } catch {}
          }}
          aria-label="Search with"
          className="cursor-pointer appearance-none bg-transparent pr-1 text-[12px] text-ink underline decoration-line-strong underline-offset-2 outline-none"
        >
          {(Object.keys(ENGINES) as Engine[]).map((k) => (
            <option key={k} value={k}>
              {ENGINES[k].label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
