"use client";

// Under each finished answer (PRD F7): copy, thumbs up, thumbs down. A thumbs down is saved at
// once, then offers an optional reason ("Wrong", "Not in my slides", "Too long", "Other" + a few
// words). Pressing the same thumb again takes the rating back. Quiet line icons, as elsewhere.
import { useState } from "react";

export type Rating = { rating: 1 | -1; reason: string | null } | null;

const REASONS = [
  { id: "wrong", label: "Wrong" },
  { id: "not_in_slides", label: "Not in my slides" },
  { id: "too_long", label: "Too long" },
  { id: "other", label: "Other" },
] as const;

async function save(body: object): Promise<boolean> {
  try {
    const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch {
    return false;
  }
}

export function AnswerActions({ messageId, text, initial }: { messageId: string; text: string; initial: Rating }) {
  const [rated, setRated] = useState<Rating>(initial);
  const [asking, setAsking] = useState(false); // reason row open
  const [other, setOther] = useState<string | null>(null); // "Other" text box
  const [thanks, setThanks] = useState(false);
  const [copied, setCopied] = useState(false);

  const rate = async (rating: 1 | -1) => {
    const prev = rated;
    const next = rated?.rating === rating ? null : { rating, reason: null };
    setRated(next);
    setAsking(next?.rating === -1);
    setOther(null);
    setThanks(next?.rating === 1);
    const ok = await save({ message_id: messageId, rating: next ? rating : 0 });
    if (!ok) {
      setRated(prev);
      setAsking(false);
      setThanks(false);
    }
  };

  const giveReason = async (reason: string, comment?: string) => {
    setRated({ rating: -1, reason });
    setAsking(false);
    setOther(null);
    setThanks(true);
    await save({ message_id: messageId, rating: -1, reason, comment: comment ?? null });
  };

  const copy = async () => {
    try {
      // Copy just the words: drop the [[s:KEY]] citation markers and <general> tags.
      await navigator.clipboard.writeText(text.replace(/\s*\[\[s:[^\]]*\]\]/g, "").replace(/<\/?general>/g, "").trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-0.5 text-muted">
        <Action label={copied ? "Copied" : "Copy answer"} onClick={copy} active={copied}>
          {copied ? <path d="M5 12.5 10 17.5 19 7" /> : <path d="M8.5 8.5V5.5A1.5 1.5 0 0 1 10 4h8.5A1.5 1.5 0 0 1 20 5.5V14a1.5 1.5 0 0 1-1.5 1.5h-3M5.5 8.5H14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 14 20H5.5A1.5 1.5 0 0 1 4 18.5V10a1.5 1.5 0 0 1 1.5-1.5Z" />}
        </Action>
        <Action label="Good answer" onClick={() => rate(1)} active={rated?.rating === 1} pressed={rated?.rating === 1}>
          <path d="M7.5 10.5v9H5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h2.5Zm0 0L11 4a2 2 0 0 1 2.5 2.4L12.8 10h5a2 2 0 0 1 2 2.3l-1 6a2 2 0 0 1-2 1.7H7.5" />
        </Action>
        <Action label="Bad answer" onClick={() => rate(-1)} active={rated?.rating === -1} pressed={rated?.rating === -1}>
          <path d="M16.5 13.5v-9H19a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2.5Zm0 0L13 20a2 2 0 0 1-2.5-2.4l.7-3.6h-5a2 2 0 0 1-2-2.3l1-6a2 2 0 0 1 2-1.7h9.3" />
        </Action>
        {thanks && !asking && <span className="pop-in ml-1.5 text-xs">Thanks, that helps.</span>}
      </div>

      {asking && (
        <div className="pop-in mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="What was wrong?">
          <span className="mr-1 text-xs text-muted">What was wrong?</span>
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => (r.id === "other" ? setOther("") : giveReason(r.id))}
              className={`rounded-full px-3 py-1 text-xs transition active:scale-95 ${other !== null && r.id === "other" ? "bg-ink text-page" : "bg-sunken text-ink hover:bg-pau-100"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {asking && other !== null && (
        <form
          className="pop-in mt-2 flex max-w-md items-center gap-2 rounded-full bg-sunken py-1 pl-4 pr-1"
          onSubmit={(e) => {
            e.preventDefault();
            giveReason("other", other.trim());
          }}
        >
          <input
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            maxLength={500}
            placeholder="A few words (optional)"
            aria-label="What was wrong"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
          <button type="submit" className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white active:scale-95">
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function Action({ label, onClick, active, pressed, children }: { label: string; onClick(): void; active?: boolean; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-full transition hover:bg-sunken hover:text-ink active:scale-90 ${active ? "text-brand" : ""}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={pressed ? "currentColor" : "none"} fillOpacity={pressed ? 0.15 : 0} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
