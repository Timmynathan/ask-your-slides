// Landing page "Plans" (PRD F12): Free and Finals, a comparison, one line on premium courses.
// Every price, limit and date comes from the plans config the server enforces.
import Link from "next/link";
import { CompareTable } from "@/components/plans/compare-table";
import { FinalsCta } from "@/components/plans/get-finals-link";
import { PlanCards } from "@/components/plans/plan-cards";
import type { PlanOffer } from "@/lib/plans/offer";
import { Reveal } from "./reveal";

const pill = "inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium transition active:scale-[0.98]";
// After sign-up (and the short Welcome), straight to checkout.
const FINALS_HREF = `/sign-up?next=${encodeURIComponent("/pay")}`;

export function PlansSection({ offer }: { offer: PlanOffer }) {
  return (
    <section id="plans" aria-labelledby="plans-title" className="scroll-mt-20 bg-tint py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 id="plans-title" className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Plans</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">Start free. Get Finals when exams are close.</p>

        <Reveal className="mt-12">
          <PlanCards
            offer={offer}
            freeAction={
              <Link href="/sign-up" className={`${pill} text-ink ring-1 ring-line-strong hover:bg-sunken`}>
                Start free
              </Link>
            }
            finalsAction={
              <FinalsCta offer={offer} href={FINALS_HREF} />
            }
          />
          <p className="mt-6 text-center text-sm text-muted">One-time payment. No subscription. Pay by bank transfer.</p>
        </Reveal>

        <Reveal className="mt-14" delay={80}>
          <h3 className="sr-only">Compare the plans</h3>
          <CompareTable offer={offer} />
          <p className="mt-4 text-center text-sm text-muted">Premium courses are the heaviest courses in your programme.</p>
        </Reveal>
      </div>
    </section>
  );
}
