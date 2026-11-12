"use client";

// The Finals price: before PRICE_CHANGE_DATE the early price, large, with the full price struck
// through and "Price goes up in 2d 4h"; after it, the full price only. The time is re-read in the
// browser, so a page cached before the change still flips at the right moment.
import { useEffect, useState } from "react";
import { naira, timeLeft, type PlanOffer } from "@/lib/plans/offer";

function useNow(enabled: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export function FinalsPrice({ offer, size = "lg" }: { offer: PlanOffer; size?: "lg" | "md" }) {
  const now = useNow(offer.early);
  const left = offer.early ? (now === null ? "" : timeLeft(offer.priceChangeAt, now)) : null;
  const early = offer.early && left !== null;
  const big = size === "lg" ? "text-5xl" : "text-4xl";

  return (
    <div>
      <p className="flex items-baseline gap-3">
        <span className={`font-heading ${big} font-semibold tracking-tight text-ink`}>{naira(early ? offer.earlyPrice : offer.fullPrice)}</span>
        {early && (
          <s className="text-xl text-muted" aria-label={`was ${naira(offer.fullPrice)}`}>
            {naira(offer.fullPrice)}
          </s>
        )}
      </p>
      {early && (
        <>
          <p className="mt-2 text-sm text-muted">
            {naira(offer.earlyPrice)} until {offer.priceChangeLabel}, then {naira(offer.fullPrice)}
          </p>
          {left && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-pau-100 px-2.5 py-0.5 text-[12px] font-medium text-pau-800 dark:text-pau-400">
              <ClockIcon />
              Price goes up in {left}
            </p>
          )}
        </>
      )}
      {!early && <p className="mt-2 text-sm text-muted">One-time payment</p>}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
