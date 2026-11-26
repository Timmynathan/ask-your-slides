"use client";

// "Something missing?" under My courses (owner, 26 Nov 2026): a quiet link that opens into one line where
// the student says what's missing (a course, a lecture, past questions). Saved to app_feedback like the
// Feedback window, tagged page "/dashboard#missing" and the "Feature request" feature, so it shows on /admin.
import { useEffect, useRef, useState } from "react";

export function SomethingMissing() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/app-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Missing: ${message}`, features: ["request"], page: "/dashboard#missing" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't send it. Try again.");
      setSent(true);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <p className="mt-8 text-center text-sm text-muted" role="status">Thanks, we&apos;ll look into it.</p>;
  }

  if (!open) {
    return (
      <div className="mt-8 text-center">
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline">
          Something missing?
        </button>
      </div>
    );
  }

  return (
    <form
      className="mx-auto mt-8 max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-4 pr-1.5 ring-1 ring-line-strong focus-within:ring-brand">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && !text && setOpen(false)}
          maxLength={500}
          placeholder="Tell us what's missing: a course, a lecture…"
          aria-label="What's missing"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          aria-label="Send"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
          </svg>
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-center text-sm text-red-700">{error}</p>}
    </form>
  );
}
