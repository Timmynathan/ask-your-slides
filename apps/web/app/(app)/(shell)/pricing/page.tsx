import { ContentSkeleton } from "@/components/nav/content-skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { PlanOfferPanel } from "@/components/onboarding/plan-step";
import { PromoCodeToCourses } from "@/components/plans/promo-code-form";
import { requireUser } from "@/lib/auth/session";
import { EXAMS_START, FREE_PAST_PROGRAMMES, TIME_ZONE } from "@/lib/plans/config";
import { CalendarDays } from "lucide-react";
import { planState } from "@/lib/plans/entitlement";
import { planOffer } from "@/lib/plans/offer";
import { latestRequest, paymentsOpen } from "@/lib/plans/manual-pay";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Plans · Ask Your Slides" };

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: TIME_ZONE });
const action = "inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium";

// In-app pricing (PRD F12): the onboarding plan view (owner, 24 Nov 2026: no comparison table anywhere);
// "Get Finals" goes to /pay (bank transfer + WhatsApp).
async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("onboarded, programme, display_name").eq("id", user.id).single();
  if (!profile?.onboarded || !profile.programme) redirect(`/welcome?next=${encodeURIComponent("/pricing")}`);

  const now = new Date();
  const db = adminClient();
  const [state, latest] = await Promise.all([planState(db, user.id, now), latestRequest(db, user.id)]);
  const offer = planOffer(now);
  const daysToExams = Math.max(0, Math.ceil((EXAMS_START.getTime() - now.getTime()) / 86_400_000));

  return (
    <>
    <div className="min-h-dvh bg-page text-ink">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        {/* Tablets up: the sidebar has the logo. */}
        <Link href="/dashboard" aria-label="My courses" className="md:invisible">
          <Logo />
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-5">
        {daysToExams > 0 && (
          <div className="mb-8 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#BBEEF0] px-3 py-1 text-[13px] font-medium text-brand">
              <CalendarDays size={15} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
              Exams start {longDate.format(EXAMS_START)} · {daysToExams} {daysToExams === 1 ? "day" : "days"} to go
            </span>
          </div>
        )}
        {state.plan === "finals" ? (
          // On Finals: nothing to sell (owner, 24 Nov 2026: one pricing view, no comparison table).
          <div className="mx-auto max-w-lg text-center">
            <h1 className="font-heading text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[44px]">You&apos;re on Finals</h1>
            {state.endsAt && <p className="mt-3 text-[15px] leading-relaxed text-muted sm:text-[16px]">Everything is unlocked until {longDate.format(state.endsAt)}.</p>}
            <Link href="/dashboard" className={`${action} mt-8 bg-brand text-brand-ink hover:opacity-90`}>
              Go to my courses
            </Link>
          </div>
        ) : (
          // The same view as onboarding's last step and the Upgrade pop-up (owner, 24 Nov 2026).
          <>
            {latest?.status === "pending" && (
              <p className="mx-auto mb-6 max-w-lg rounded-2xl bg-sunken px-4 py-3 text-center text-[14px] text-ink">
                Your payment is being checked. Finals switches on as soon as it&apos;s confirmed.
              </p>
            )}
            <PlanOfferPanel offer={{ ...offer, paymentsOpen: paymentsOpen() }} freePast={FREE_PAST_PROGRAMMES.includes(profile.programme)} promo={<PromoCodeToCourses />} />
          </>
        )}
      </main>
    </div>
    </>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
