"use client";

// Opens when a limit or lock stops a Free student (PRD F12): what happened, when it resets (for
// daily limits), what Finals adds, and "Get Finals". The server already refused and logged it;
// this only explains.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { naira, timeLeft, type PlanOffer } from "@/lib/plans/offer";
import { CheckoutButton } from "./checkout-button";
import { FinalsPrice } from "./finals-price";
import { CheckIcon } from "./plan-cards";

export type LimitCode = "daily_cap" | "premium_cap" | "summary" | "quiz";
export const LIMIT_CODES: LimitCode[] = ["daily_cap", "premium_cap", "summary", "quiz"];

export function PricingSheet({
  code,
  resetsAt,
  offer,
  onClose,
}: {
  code: LimitCode;
  resetsAt: string | null;
  offer: PlanOffer;
  onClose(): void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The sheet only ever opens from a click or a refused request, so this runs in the browser.
  const [resetIn] = useState(() => (resetsAt ? timeLeft(resetsAt, Date.now()) : null));
  const copy: Record<LimitCode, { title: string; body: string }> = {
    daily_cap: {
      title: "That's today's free messages",
      body: `Your messages come back at midnight${resetIn ? ` (in ${resetIn})` : ""}. Finals gives you ${offer.finals.daily} a day.`,
    },
    premium_cap: {
      title: "That's today's free questions for this course",
      body: `Premium courses have a few free questions a day. Yours come back at midnight${resetIn ? ` (in ${resetIn})` : ""}. Finals has no limit on them.`,
    },
    summary: { title: "You've used your free summary", body: "Finals gives you unlimited summaries, in every course." },
    quiz: { title: "Quiz mode comes with Finals", body: "Get quizzed on any topic, one question at a time, marked against your slides." },
  };
  const c = copy[code];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="pop-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card p-6 shadow-2xl outline-none sm:rounded-[28px] sm:p-7"
      >
        <h2 id="sheet-title" className="font-heading text-2xl font-semibold tracking-tight text-ink">{c.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.body}</p>

        <div className="mt-6 rounded-[22px] p-5 ring-2 ring-brand">
          <p className="text-sm font-semibold text-ink">Finals</p>
          <div className="mt-2">
            <FinalsPrice offer={offer} size="md" />
          </div>
          <ul className="mt-4 space-y-2 text-[14px] text-ink">
            {[`${offer.finals.daily} messages a day`, "All your courses, no limits", "Unlimited summaries and quiz mode", "Valid until your last paper"].map((t) => (
              <li key={t} className="flex gap-2.5">
                <CheckIcon />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <CheckoutButton price={offer.price} />
          </div>
          <p className="mt-3 text-center text-[12px] text-muted">One-time {naira(offer.price)}. No subscription. Card, transfer or USSD.</p>
        </div>

        <button type="button" onClick={onClose} className="mt-4 w-full rounded-full px-6 py-3 text-[15px] text-muted transition hover:bg-sunken hover:text-ink">
          Maybe later
        </button>
      </div>
    </div>,
    document.body,
  );
}
