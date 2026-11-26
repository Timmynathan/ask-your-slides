"use client";

// "Something missing?" under My courses (owner, 26 Nov 2026): a quiet link that opens a small pop-up where the
// student says what's missing (a course, a lecture, past questions). Saved to app_feedback like the Feedback
// window, tagged page "/dashboard#missing" and the "Feature request" feature, so it shows on /admin.
import { useEffect, useState } from "react";

export function SomethingMissing() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mt-8 text-center">
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline">
          Something missing?
        </button>
      </div>
      {open && <MissingDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MissingDialog({ onClose }: { onClose(): void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="missing-title" className="pop-in w-full max-w-sm rounded-[22px] bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 id="missing-title" className="font-heading text-[22px] text-ink">
            {sent ? "Thank you!" : "Something missing?"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {sent ? (
          <>
            <p className="mt-2 text-[15px] text-muted">We&apos;ll look into it and add it if we can.</p>
            <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90">
              Done
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <p className="mt-2 text-[15px] text-muted">Tell us if anything is missing: a course, a lecture or past questions.</p>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              autoFocus
              placeholder="e.g. a course code and title"
              aria-label="What's missing"
              className="mt-4 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-pau-200"
            />
            {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="mt-4 w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
