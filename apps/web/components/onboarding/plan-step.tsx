"use client";

// The last onboarding step, the plan (and, since 24 Nov 2026, the only pricing view: the Upgrade pop-up and
// /pricing show the same PlanOfferPanel) (owner, 22 Nov 2026, modelled on a calm two-column paywall):
// on the left the student's study partner and real testimonials; on the right the Finals offer, a
// "See what's included" comparison, Get Finals, and the promo code. Start studying starts on Free.
// No countdown and no invented numbers: the student count is the owner's real figure, and each quote is
// something that student said.
/* eslint-disable @next/next/no-img-element -- a small local photo */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Minus, X } from "lucide-react";
import { comparisonRows } from "@/lib/plans/offer";
import { naira, type PlanOffer } from "@/lib/plans/offer";
import testimonials from "@/content/testimonials.json";

type Quote = { text: string; name: string; detail: string; photo?: string; initial?: string };
// Real students' words, edited in content/testimonials.json (data, not code: names stay out of the app's code).
const QUOTES = testimonials as Quote[];
const ROTATE_MS = 2500;

export function PlanStep({ offer, freePast, onFree, promo }: {
  offer: PlanOffer & { paymentsOpen?: boolean };
  freePast: boolean;
  onFree(): void;
  promo: ReactNode;
}) {
  return (
    <div key="plan" className="panel-in w-full max-w-5xl">
      <div className="flex items-center justify-end">
        {/* The end of onboarding (owner, 27 Nov 2026): "Start studying" goes to the dashboard on Free. */}
        <button type="button" onClick={onFree} className="rounded-full bg-card px-5 py-2.5 text-[14.5px] font-medium text-brand ring-1 ring-line-strong transition hover:bg-sunken active:scale-95">
          Start studying
        </button>
      </div>
      <div className="mt-8">
        <PlanOfferPanel offer={offer} freePast={freePast} promo={promo} />
      </div>
    </div>
  );
}

/** The plan offer itself (owner, 24 Nov 2026: the one pricing view across the app): testimonials on the
 *  left, Finals on the right. Used by onboarding, the Upgrade pop-up (upgrade-dialog.tsx) and /pricing. */
export function PlanOfferPanel({ offer, freePast, promo }: {
  offer: PlanOffer & { paymentsOpen?: boolean };
  freePast: boolean;
  promo: ReactNode;
}) {
  const [q, setQ] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduce) return;
    const t = setInterval(() => setQ((x) => (x + 1) % QUOTES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, []);
  const quote = QUOTES[q];

  return (
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        {/* Left: the study partner, then the testimonials. */}
        <div className="order-2 flex flex-col items-center lg:order-1">
          {/* A plain black line drawing (owner, 22 Nov 2026: minimalist, no colour): books, a cap, a star. */}
          <svg viewBox="0 0 220 190" className="hidden h-48 w-56 text-brand sm:block " fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {/* Three stacked books */}
            <rect x="48" y="150" width="124" height="22" rx="3" />
            <path d="M60 150v22M160 150v22" />
            <rect x="58" y="128" width="108" height="22" rx="3" />
            <path d="M70 128v22" />
            <rect x="52" y="106" width="116" height="22" rx="3" />
            <path d="M156 106v22M64 117h40" />
            {/* Graduation cap */}
            <path d="M110 70 70 86l40 16 40-16-40-16Z" />
            <path d="M88 93v10c0 5 10 9 22 9s22-4 22-9V93" />
            <path d="M150 86v18" />
            <circle cx="150" cy="107" r="2.5" />
            {/* Star, gently twinkling */}
            <g className="encourage-twinkle" style={{ transformOrigin: "170px 34px" }}>
              <path d="m170 18 4.6 9.6 10.4 1.4-7.6 7.2 1.9 10.3-9.3-5-9.3 5 1.9-10.3-7.6-7.2 10.4-1.4L170 18Z" />
            </g>
            <path d="M196 30h8M192 52l6 4M144 22l-6-5" />
          </svg>
          {/* Every photo is loaded up front (hidden), so a switch never waits on an image: the quote, name and
              photo change together (owner, 22 Nov 2026). */}
          <div className="hidden" aria-hidden>
            {QUOTES.map((x) => x.photo && <img key={x.name} src={x.photo} alt="" loading="eager" />)}
          </div>
          <figure key={q} className="encourage-in mt-6 w-full max-w-md rounded-2xl bg-card p-5 ring-1 ring-line">
            <blockquote className="text-[15.5px] leading-relaxed text-brand">&ldquo;{quote.text}&rdquo;</blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              {quote.photo ? (
                <img src={quote.photo} alt="" width={40} height={40} loading="eager" decoding="sync" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-pau-100 font-medium text-brand">{quote.initial}</span>
              )}
              <span>
                <span className="block text-[14.5px] text-brand">{quote.name}</span>
                <span className="block text-[12.5px] text-muted">{quote.detail}</span>
              </span>
            </figcaption>
          </figure>
          <div className="mt-4 flex gap-1.5">
            {QUOTES.map((x, i) => (
              <button
                key={x.name}
                type="button"
                onClick={() => setQ(i)}
                aria-label={`Show ${x.name}'s quote`}
                className={`h-1.5 rounded-full transition-all ${i === q ? "w-6 bg-brand" : "w-1.5 bg-line-strong hover:bg-muted"}`}
              />
            ))}
          </div>
        </div>

        {/* Right: the offer. */}
        <div className="order-1 lg:order-2">
          <h1 className="font-heading text-[28px] font-normal leading-tight tracking-tight text-brand sm:text-[34px]">
            Join 200+ PAU students already studying with Ask Your Slides
          </h1>
          <p className="mt-2 text-[15px] text-muted">Start free. Get Finals when exams are close.</p>

          <div className="mt-6 overflow-hidden rounded-2xl ring-2 ring-brand">
            <p className="bg-brand py-1.5 text-center text-[12px] font-semibold uppercase tracking-wide text-brand-ink">One payment · until your last paper</p>
            <div className="flex items-center gap-4 bg-card px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold text-brand">Finals</p>
                <p className="text-[13.5px] text-muted">
                  {offer.finals.daily} questions a day, quiz mode{freePast ? ", summaries" : ", past questions"}
                </p>
              </div>
              <p className="text-right">
                <span className="font-heading text-[26px] font-semibold text-brand">{naira(offer.price)}</span>
                {offer.early && <s className="ml-2 text-[14px] text-muted">{naira(offer.fullPrice)}</s>}
              </p>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-brand-ink">
                <Check size={15} absoluteStrokeWidth strokeWidth={2.2} aria-hidden />
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mx-auto mt-4 flex items-center gap-1.5 text-[14.5px] text-brand hover:opacity-80"
          >
            See what&apos;s included
            <ChevronDown size={16} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
          </button>
          {open && <IncludedPopup offer={offer} freePast={freePast} onClose={() => setOpen(false)} />}

          {offer.paymentsOpen ? (
            <a href="/pay" className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-brand text-[15.5px] font-medium text-brand-ink shadow-[0_10px_30px_-12px_var(--brand)] transition hover:opacity-90 active:scale-[0.99]">
              Get Finals
            </a>
          ) : (
            <p className="mt-6 text-center text-[14px] text-muted">Finals goes on sale shortly. Keep studying free in the meantime.</p>
          )}
          <p className="mt-2.5 text-center text-[13px] text-muted">One-time payment · No subscription · Bank transfer</p>
          <div className="mt-3 flex justify-center">{promo}</div>
        </div>
      </div>
  );
}

/** "See what's included" (owner, 22 Nov 2026): a small pop-up, black and grey only, one compact row per
 *  feature: Free and Finals side by side, a tick or a dash or the short value. */
function IncludedPopup({ offer, freePast, onClose }: { offer: PlanOffer; freePast: boolean; onClose(): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const cell = (v: string | boolean) =>
    v === true ? <Check size={16} absoluteStrokeWidth strokeWidth={2} className="mx-auto text-brand " aria-label="Included" />
    : v === false ? <Minus size={16} absoluteStrokeWidth strokeWidth={1.6} className="mx-auto text-brand/30 " aria-label="Not included" />
    : <span className="text-[12.5px] leading-snug text-brand ">{v}</span>;
  // Rendered on <body>: the step's slide-in animation would otherwise trap the backdrop inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" onClick={onClose}>
      <div role="dialog" aria-label="What's included" className="pop-in w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold text-brand ">What&apos;s included</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-brand hover:bg-sunken ">
            <X size={16} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
          </button>
        </div>
        <table className="mt-3 w-full table-fixed text-left">
          <thead>
            <tr className="border-b border-brand/20 text-[12.5px] ">
              <th className="w-[44%] pb-2 font-normal text-brand/70 ">Feature</th>
              <th className="pb-2 text-center font-semibold text-brand ">Free</th>
              <th className="pb-2 text-center font-semibold text-brand ">Finals</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows(offer, { freePast }).map((r) => (
              <tr key={r.label} className="border-b border-brand/10 last:border-0 ">
                <th scope="row" className="py-2 pr-2 text-[12.5px] font-normal leading-snug text-brand ">{r.label}</th>
                <td className="px-1 py-2 text-center">{cell(r.free)}</td>
                <td className="px-1 py-2 text-center">{cell(r.finals)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
}
