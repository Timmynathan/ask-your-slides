"use client";

// "Ask anything across your courses" (owner, 21 Nov 2026), in place of the dashboard's separate chat
// panel: a doorway, not a second chat. The question is matched to the right course (/api/ask) and
// opens in that course's whole-course chat, so every conversation lives in exactly one course. When
// two courses fit about equally, the student picks. "Wrong course?" in the course comes back here
// with the question and the choices (?ask=…&pick=1).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Choice = { id: string; label: string; href: string };

export function askHref(href: string, question: string) {
  return `${href}${href.includes("?") ? "&" : "?"}ask=${encodeURIComponent(question)}`;
}

export function AskBox() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function route(question: string, forcePick: boolean) {
    setBusy(true);
    setError(null);
    setChoices(null);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't find the right course. Try again.");
      const list = body.choices as Choice[];
      if (body.clear && !forcePick) {
        router.push(askHref(list[0].href, question));
        return; // keep "busy" until the course page takes over
      }
      setChoices(list);
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  // Back from a course via "Wrong course?": the question again, with the courses to pick from.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("ask");
    if (!q) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const t = setTimeout(() => {
      setText(q);
      void route(q, sp.get("pick") === "1");
    }, 0);
    return () => clearTimeout(t);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (q && !busy) void route(q, false);
  };

  return (
    <div className="mb-8">
      <form onSubmit={submit} className="relative">
        <label htmlFor="ask-anything" className="sr-only">
          Ask anything across your courses
        </label>
        <input
          id="ask-anything"
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (choices) setChoices(null);
          }}
          maxLength={4000}
          placeholder="Ask anything across your courses…"
          className="h-14 w-full rounded-full border border-line-strong bg-card pl-5 pr-16 text-[16px] text-ink shadow-sm outline-none transition placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-pau-200"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label="Ask"
          className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-brand text-brand-ink transition hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-ink/40 border-t-brand-ink" aria-hidden />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </form>
      {busy && <p className="mt-2 pl-5 text-[13px] text-muted">Finding the right course…</p>}
      {error && <p role="alert" className="mt-2 pl-5 text-[13.5px] text-red-700">{error}</p>}
      {choices && (
        <div className="pop-in mt-3 rounded-2xl bg-sunken/70 p-4">
          <p className="text-[14px] text-ink">Which course is this for?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => router.push(askHref(c.href, text.trim()))}
                className="rounded-full bg-card px-4 py-2 text-left text-[14px] text-ink ring-1 ring-line-strong transition hover:ring-brand active:scale-95"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
