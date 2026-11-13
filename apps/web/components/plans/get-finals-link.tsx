// "Get Finals" everywhere in the app (pricing page, pricing sheet): goes to /pay, where the
// student transfers and sends the receipt. Disabled with "Payments open soon" until the bank
// details and WhatsApp number are set (lib/plans/manual-pay.ts).
import Link from "next/link";
import { naira } from "@/lib/plans/offer";

const base = "inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-medium text-brand-ink";

export function GetFinalsLink({ price, open, pending = false }: { price: number; open: boolean; pending?: boolean }) {
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
  return (
    <Link href="/pay" className={`${base} transition hover:opacity-90 active:scale-[0.98]`}>
      Get Finals · {naira(price)}
    </Link>
  );
}
