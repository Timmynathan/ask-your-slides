"use client";

// The last onboarding step, the plan (owner, 22 Nov 2026, modelled on a calm two-column paywall):
// on the left the student's study partner and real testimonials; on the right the Finals offer, a
// "See what's included" comparison, Get Finals, and the promo code. Skip for now starts on Free.
// No countdown and no invented numbers: the student count is the owner's real figure, and each quote is
// something that student said.
/* eslint-disable @next/next/no-img-element -- a small local photo */
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, Sparkles } from "lucide-react";
import { Mascot } from "@/components/mascot/mascot";
import { PlanTable } from "@/components/plans/plan-table";
import { naira, type PlanOffer } from "@/lib/plans/offer";
import type { PartnerId } from "@/lib/partners";

type Quote = { text: string; name: string; detail: string; photo?: string; initial?: string };
const QUOTES: Quote[] = [
  { text: "It's great at breaking down complex topics.", name: "Oluwatimilehin Ilesanmi", detail: "Computer Science, Pan-Atlantic University", photo: "/testimonials/oluwatimilehin-ilesanmi.webp" },
  { text: "It's helped me ace my tests.", name: "Seyi O.", detail: "Pan-Atlantic University", initial: "S" },
];
const ROTATE_MS = 6000;

export function PlanStep({ offer, partner, freePast, onBack, onFree, promo }: {
  offer: PlanOffer & { paymentsOpen?: boolean };
  partner: PartnerId;
  freePast: boolean;
  onBack(): void;
  onFree(): void;
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
    <div key="plan" className="panel-in w-full max-w-5xl">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-[14px] text-ink ring-1 ring-line transition hover:bg-sunken">
          <ArrowLeft size={16} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
          Back
        </button>
        <button type="button" onClick={onFree} className="text-[14px] text-muted underline underline-offset-4 hover:text-ink">
          Skip for now
        </button>
      </div>

      <div className="mt-8 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        {/* Left: the study partner, then the testimonials. */}
        <div className="order-2 flex flex-col items-center lg:order-1">
          <div className="relative hidden h-44 w-44 place-items-center sm:grid">
            <Mascot partner={partner} size={150} mood="happy" animated={false} />
            <Sparkles size={26} absoluteStrokeWidth strokeWidth={1.5} className="encourage-twinkle absolute -right-1 top-2 text-brand" aria-hidden />
          </div>
          <figure className="mt-6 w-full max-w-md rounded-2xl bg-card p-5 ring-1 ring-line">
            <blockquote key={q} className="encourage-in text-[15.5px] leading-relaxed text-ink">&ldquo;{quote.text}&rdquo;</blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              {quote.photo ? (
                <img src={quote.photo} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-pau-100 font-medium text-brand">{quote.initial}</span>
              )}
              <span>
                <span className="block text-[14.5px] text-ink">{quote.name}</span>
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
                className={`h-1.5 rounded-full transition-all ${i === q ? "w-6 bg-ink" : "w-1.5 bg-line-strong hover:bg-muted"}`}
              />
            ))}
          </div>
        </div>

        {/* Right: the offer. */}
        <div className="order-1 lg:order-2">
          <h1 className="font-heading text-[28px] font-normal leading-tight tracking-tight text-ink sm:text-[34px]">
            Join 100+ PAU students already studying with Ask Your Slides
          </h1>
          <p className="mt-2 text-[15px] text-muted">Start free. Get Finals when exams are close.</p>

          <div className="mt-6 overflow-hidden rounded-2xl ring-2 ring-ink">
            <p className="bg-ink py-1.5 text-center text-[12px] font-semibold uppercase tracking-wide text-page">One payment · until your last paper</p>
            <div className="flex items-center gap-4 bg-card px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold text-ink">Finals</p>
                <p className="text-[13.5px] text-muted">
                  {offer.finals.daily} questions a day, quiz mode{freePast ? ", summaries" : ", past questions"}
                </p>
              </div>
              <p className="text-right">
                <span className="font-heading text-[26px] font-semibold text-ink">{naira(offer.price)}</span>
                {offer.early && <s className="ml-2 text-[14px] text-muted">{naira(offer.fullPrice)}</s>}
              </p>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-page">
                <Check size={15} absoluteStrokeWidth strokeWidth={2.2} aria-hidden />
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="mx-auto mt-4 flex items-center gap-1.5 text-[14.5px] text-ink hover:text-brand"
          >
            {open ? "Hide what's included" : "See what's included"}
            <ChevronDown size={16} absoluteStrokeWidth strokeWidth={1.6} className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {open && (
            <div className="pop-in mt-4">
              <PlanTable compact offer={offer} current="free" freePast={freePast} freeAction={null} finalsAction={null} />
            </div>
          )}

          {offer.paymentsOpen ? (
            <a href="/pay" className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-ink text-[15.5px] font-medium text-page shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)] transition hover:opacity-90 active:scale-[0.99]">
              Get Finals
            </a>
          ) : (
            <p className="mt-6 text-center text-[14px] text-muted">Finals goes on sale shortly. Keep studying free in the meantime.</p>
          )}
          <p className="mt-2.5 text-center text-[13px] text-muted">One-time payment · No subscription · Bank transfer</p>
          <div className="mt-3 flex justify-center">{promo}</div>
        </div>
      </div>
    </div>
  );
}
