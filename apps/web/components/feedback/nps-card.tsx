"use client";

// "How likely are you to recommend Ask Your Slides to a friend?" (owner, 23 Nov 2026, styled on
// StudyFetch's): a card over the page with 0-10, "Not now" and an X. A score is saved the moment it's
// tapped; then an optional "main reason", then thanks. When it shows is decided by
// lib/ui/use-nps-ask.ts. Scores land in nps_responses (the weekly email reports them).
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const SCORES = Array.from({ length: 11 }, (_, i) => i);

export function NpsCard({ onClose }: { onClose(answered: boolean): void }) {
  const [score, setScore] = useState<number | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus(); // the card, not the X: no focus ring on open
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(score !== null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, score]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => onClose(true), 1600);
    return () => clearTimeout(t);
  }, [done, onClose]);

  const pick = async (n: number) => {
    setScore(n);
    try {
      const res = await fetch("/api/nps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: n, page: window.location.pathname }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setId(body.id ?? null);
    } catch {}
  };

  const send = async () => {
    if (id && reason.trim()) {
      await fetch("/api/nps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, reason: reason.trim() }) }).catch(() => {});
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/25 px-4" role="dialog" aria-modal="true" aria-label="How likely are you to recommend Ask Your Slides?">
      <div ref={cardRef} tabIndex={-1} className="pop-in w-full max-w-[600px] rounded-[28px] bg-card p-6 text-ink shadow-2xl outline-none ring-1 ring-line sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <p className="font-heading text-[19px] leading-snug sm:text-[21px]">
            {done ? "Thank you, that really helps." : score === null ? "How likely are you to recommend Ask Your Slides to a friend?" : "What's the main reason for your score?"}
          </p>
          <button type="button" onClick={() => onClose(score !== null)} aria-label="Close" className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/60 outline-none transition hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-pau-200">
            <X size={20} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        {!done && score === null && (
          <>
            <div className="mt-5 border-t border-line pt-6">
              {/* Phones: two even rows of six and five; wider screens: one row. */}
              <div className="grid grid-cols-6 justify-items-center gap-y-2.5 sm:flex sm:justify-between">
                {SCORES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => pick(n)}
                    className="grid h-10 w-10 place-items-center rounded-full text-[15px] ring-1 ring-line-strong transition hover:bg-brand hover:text-brand-ink hover:ring-brand active:scale-90 sm:h-11 sm:w-11"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-[12.5px] text-muted">
                <span>Not at all likely</span>
                <span>Extremely likely</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => onClose(false)} className="rounded-full bg-sunken px-5 py-2.5 text-[14px] font-medium text-ink transition hover:bg-line">
                Not now
              </button>
            </div>
          </>
        )}

        {!done && score !== null && (
          <form
            className="mt-5 border-t border-line pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Optional: what made you pick that?"
              aria-label="The main reason for your score"
              className="w-full resize-none rounded-2xl bg-sunken px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-pau-200"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDone(true)} className="rounded-full px-5 py-2.5 text-[14px] text-muted transition hover:bg-sunken hover:text-ink">
                Skip
              </button>
              <button type="submit" className="rounded-full bg-brand px-5 py-2.5 text-[14px] font-medium text-brand-ink transition hover:opacity-90">
                Send
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
