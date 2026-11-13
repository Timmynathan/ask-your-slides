// "Lock in Finals" everywhere in the app (pricing page, pricing sheet, onboarding): goes to /pay.
// Marketing (owner's request): "lock in" the early price, a soft shine, and the price rise under it
// while the early price lasts. Disabled with "Payments open soon" if the bank details are missing.
import Link from "next/link";
import { naira, type PlanOffer } from "@/lib/plans/offer";

const base = "inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-medium text-brand-ink";

export function GetFinalsLink({ offer, open, pending = false }: { offer: PlanOffer; open: boolean; pending?: boolean }) {
  if (!open) {
    return (
      <div>
        <button type="button" disabled className={`${base} opacity-60`}>
          Payments open soon
        </button>
        <p className="mt-3 text-center text-sm text-muted">Finals goes on sale shortly. Keep studying free in the meantime.</p>
      </div>
    );
  }
  if (pending) {
    return (
      <Link href="/pay" className={`${base} transition hover:opacity-90`}>
        Payment pending · see details
      </Link>
    );
  }
  return <FinalsCta offer={offer} href="/pay" />;
}

/** The "Lock in Finals · <price>" button and its price-rise line (also used on the landing page). */
export function FinalsCta({ offer, href }: { offer: PlanOffer; href: string }) {
  return (
    <div>
      <Link href={href} className={`${base} cta-shine shadow-[0_10px_30px_-12px_var(--brand)] transition hover:opacity-95 active:scale-[0.98]`}>
        Lock in Finals · {naira(offer.price)}
      </Link>
      {offer.early && (
        <p className="mt-2 text-center text-[13px] text-muted">
          Goes up to {naira(offer.fullPrice)} after {offer.priceChangeLabel}
        </p>
      )}
    </div>
  );
}
