"use client";

// The Feedback window (owner, 20 Nov 2026), from the sidebar's feedback button and the account menu:
// what happened, Good/Bad, which features it's about, Submit. "Live human support" opens the owner's
// WhatsApp. Saved to app_feedback; the owner reads it on /admin.
import { useEffect, useState } from "react";
import { FEEDBACK_FEATURES, type FeedbackFeature } from "@/lib/feedback-features";
import { WHATSAPP_NUMBER } from "@/lib/plans/config";

export function FeedbackDialog({ onClose }: { onClose(): void }) {
  const [message, setMessage] = useState("");
  const [sentiment, setSentiment] = useState<"good" | "bad" | null>(null);
  const [features, setFeatures] = useState<FeedbackFeature[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: FeedbackFeature) => setFeatures((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  async function submit() {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/app-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), sentiment, features, page: window.location.pathname }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't send it. Try again.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const support = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi, I need help with Ask Your Slides.")}`;
  const pill = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] transition active:scale-95 ${on ? "bg-brand text-brand-ink" : "bg-card text-ink ring-1 ring-line-strong hover:ring-brand"}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="pop-in flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-[22px] bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="feedback-title" className="font-heading text-[24px] text-ink">
            Feedback
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-10 text-center">
            <p className="font-heading text-xl text-ink">Thank you!</p>
            <p className="mt-2 text-[15px] text-muted">We read every message and use it to make Ask Your Slides better.</p>
            <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={2000}
                autoFocus
                placeholder="Please explain in detail the feedback or issue you are having"
                aria-label="Your feedback"
                className="w-full resize-y rounded-xl border border-line-strong bg-white px-4 py-3 text-[15px] text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-pau-200"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" aria-pressed={sentiment === "good"} onClick={() => setSentiment(sentiment === "good" ? null : "good")} className={pill(sentiment === "good")}>
                  <Thumb /> Good
                </button>
                <button type="button" aria-pressed={sentiment === "bad"} onClick={() => setSentiment(sentiment === "bad" ? null : "bad")} className={pill(sentiment === "bad")}>
                  <Thumb down /> Bad
                </button>
              </div>
              <p className="mt-5 text-[14.5px] text-ink">Please select the feature you are having issues with:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {FEEDBACK_FEATURES.map((f) => (
                  <button key={f.id} type="button" aria-pressed={features.includes(f.id)} onClick={() => toggle(f.id)} className={pill(features.includes(f.id))}>
                    {f.label}
                  </button>
                ))}
              </div>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            </div>
            <div className="border-t border-line px-6 py-4">
              <button
                type="button"
                onClick={submit}
                disabled={!message.trim() || busy}
                className="w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "Sending…" : "Submit"}
              </button>
              <a href={support} target="_blank" rel="noopener noreferrer" className="mt-3 block text-center text-[14px] text-ink underline underline-offset-4 hover:text-brand">
                Want to chat with live human support? Click here
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Thumb({ down = false }: { down?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={down ? "rotate-180" : ""}>
      <path d="M7 10v10H4V10h3zM7 10l4-7a2 2 0 0 1 2.8 2.4L12.5 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" />
    </svg>
  );
}
