"use client";

// The Upgrade pop-up (owner, 24 Nov 2026: "when a student clicks upgrade they should see a pop up of the
// pricing page we used on the onboarding"). Every Upgrade button opens this instead of /pricing; it shows
// the onboarding plan view (PlanOfferPanel) over the page. The offer is fetched when it opens.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PlanOfferPanel } from "@/components/onboarding/plan-step";
import { PromoCodeForm } from "./promo-code-form";
import type { PlanOffer } from "@/lib/plans/offer";

type Loaded = { offer: PlanOffer & { paymentsOpen?: boolean }; freePast: boolean };

export function UpgradeDialog({ onClose }: { onClose(): void }) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/plans/offer")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Loaded) => live && setData(d))
      .catch(() => live && setFailed(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  // The offer couldn't load: fall back to the full pricing page.
  useEffect(() => {
    if (failed) router.push("/pricing");
  }, [failed, router]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Finals"
        onClick={(e) => e.stopPropagation()}
        className="pop-in relative max-h-[94dvh] w-full max-w-5xl overflow-y-auto rounded-t-[28px] bg-page px-5 pb-8 pt-14 shadow-2xl sm:rounded-[28px] sm:px-10 sm:pb-10"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full text-ink transition hover:bg-sunken"
        >
          <X size={20} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
        </button>
        {data ? (
          <PlanOfferPanel
            offer={data.offer}
            freePast={data.freePast}
            promo={
              <PromoCodeForm
                plain
                onRedeemed={() => {
                  onClose();
                  router.refresh();
                }}
              />
            }
          />
        ) : (
          <div className="grid h-[420px] place-items-center" aria-busy="true">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens the Upgrade pop-up. Looks like whatever `className` says. */
export function UpgradeButton({ className, children, title, ariaLabel }: { className?: string; children: ReactNode; title?: string; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []); // stable: the dialog's effect runs once
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} title={title} aria-label={ariaLabel}>
        {children}
      </button>
      {open && <UpgradeDialog onClose={close} />}
    </>
  );
}
