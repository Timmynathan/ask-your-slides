import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { CheckoutButton } from "@/components/plans/checkout-button";
import { CompareTable } from "@/components/plans/compare-table";
import { PlanCards } from "@/components/plans/plan-cards";
import { requireUser } from "@/lib/auth/session";
import { TIME_ZONE } from "@/lib/plans/config";
import { planState } from "@/lib/plans/entitlement";
import { planOffer } from "@/lib/plans/offer";
import { paymentsOpen } from "@/lib/plans/paystack";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Plans · Ask Your Slides" };

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: TIME_ZONE });
const action = "inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium";

// In-app pricing (PRD F12): Free and Finals; "Get Finals" goes to Paystack through the server.
// ?checkout=1 (from the landing page's "Get Finals", after sign-up) opens the referral field and
// focuses the pay button.
async function Loaded({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("onboarded, programme").eq("id", user.id).single();
  if (!profile?.onboarded || !profile.programme) redirect(`/welcome?next=${encodeURIComponent("/pricing?checkout=1")}`);

  const now = new Date();
  const state = await planState(adminClient(), user.id, now);
  const offer = planOffer(now);
  const checkout = sp.checkout === "1";

  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/dashboard" aria-label="My courses">
          <Logo />
        </Link>
        <Link href="/dashboard" className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-sunken hover:text-ink">
          Back to my courses
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-5">
        <h1 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">Plans</h1>
        <p className="mx-auto mt-3 max-w-md text-center text-muted">
          {state.plan === "finals" && state.endsAt
            ? `You're on Finals until ${longDate.format(state.endsAt)}.`
            : "Start free. Get Finals when exams are close."}
        </p>

        <div className="mt-10">
          <PlanCards
            offer={offer}
            current={state.plan}
            freeAction={
              state.plan === "free" ? (
                <Link href="/dashboard" className={`${action} text-ink ring-1 ring-line-strong hover:bg-sunken`}>
                  Keep studying free
                </Link>
              ) : null
            }
            finalsAction={
              state.plan === "finals" ? (
                <Link href="/dashboard" className={`${action} bg-brand text-brand-ink hover:opacity-90`}>
                  Go to my courses
                </Link>
              ) : (
                <CheckoutButton price={offer.price} open={paymentsOpen()} autoFocus={checkout} openReferral={checkout} />
              )
            }
          />
          <p className="mt-6 text-center text-sm text-muted">One-time payment. No subscription. Pay with card, transfer or USSD.</p>
        </div>

        <div className="mt-14">
          <h2 className="sr-only">Compare the plans</h2>
          <CompareTable offer={offer} />
          <p className="mt-4 text-center text-sm text-muted">Premium courses are the heaviest courses in your programme.</p>
        </div>
      </main>
    </div>
  );
}

export default function PricingPage(props: { searchParams: Promise<{ checkout?: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
