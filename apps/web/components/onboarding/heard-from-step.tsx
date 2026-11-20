"use client";

// Sign-up step "How did you hear about us?" (owner, 20 Nov 2026): one tap on a card answers and
// moves on. Layout after the owner's reference: a big question over a two-column grid of cards.
import { HEARD_FROM, type HeardFrom } from "@/lib/heard-from";

function LineIcon({ d }: { d: string }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-ink">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  );
}

const ICONS: Record<HeardFrom, React.ReactNode> = {
  friend: <LineIcon d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75" />,
  course_rep: <LineIcon d="M3 11l15-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" />,
  tiktok: (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#fff"
          d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
        />
      </svg>
    </span>
  ),
  snapchat: (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FFFC00]">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#fff"
          stroke="#111"
          strokeWidth="1.3"
          strokeLinejoin="round"
          d="M12 3c-3 0-5 2.2-5 5.2v2.1c-.6.1-1.3.2-1.6.6.3.6 1.4.8 1.7 1-.4 1.2-1.6 2.8-3.4 3.3.2.6 1.3.8 2.3 1 .2.5.2 1 .5 1.2.6.2 1.5-.2 2.5 0 1 .3 1.6 1.6 3 1.6s2-1.3 3-1.6c1-.2 1.9.2 2.5 0 .3-.2.3-.7.5-1.2 1-.2 2.1-.4 2.3-1-1.8-.5-3-2.1-3.4-3.3.3-.2 1.4-.4 1.7-1-.3-.4-1-.5-1.6-.6V8.2C17 5.2 15 3 12 3z"
        />
      </svg>
    </span>
  ),
  other: (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sunken text-[15px] tracking-[2px] text-muted" aria-hidden>
      ···
    </span>
  ),
};

export function HeardFromStep({ value, onPick, onBack }: { value: HeardFrom | null; onPick(id: HeardFrom): void; onBack(): void }) {
  return (
    <div key="heard" className="panel-in w-full max-w-3xl text-center">
      <h1 className="font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">How did you hear about us?</h1>
      <div role="radiogroup" aria-label="How did you hear about us?" className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4">
        {HEARD_FROM.map((h, i) => {
          const on = value === h.id;
          const lastAlone = i === HEARD_FROM.length - 1 && HEARD_FROM.length % 2 === 1;
          return (
            <button
              key={h.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(h.id)}
              className={`flex items-center gap-4 rounded-full border bg-card px-4 py-3 text-left text-[16px] font-medium text-ink transition hover:border-brand active:scale-[0.98] sm:py-3.5 ${
                on ? "border-brand ring-2 ring-brand" : "border-line"
              } ${lastAlone ? "sm:col-span-2 sm:mx-auto sm:w-[calc(50%-0.5rem)]" : ""}`}
            >
              {ICONS[h.id]}
              {h.label}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onBack} className="mt-8 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        Back
      </button>
    </div>
  );
}
