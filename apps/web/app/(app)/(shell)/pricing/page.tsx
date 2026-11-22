import { ContentSkeleton } from "@/components/nav/content-skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { GetFinalsLink } from "@/components/plans/get-finals-link";
import { PlanTable } from "@/components/plans/plan-table";
import { PromoCodeToCourses } from "@/components/plans/promo-code-form";
import { requireUser } from "@/lib/auth/session";
import { EXAMS_START, FREE_PAST_PROGRAMMES, PREMIUM_COURSES_ON, TIME_ZONE } from "@/lib/plans/config";
import { CalendarDays } from "lucide-react";
import { planState } from "@/lib/plans/entitlement";
import { planOffer } from "@/lib/plans/offer";
import { latestRequest, paymentsOpen } from "@/lib/plans/manual-pay";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Plans · Ask Your Slides" };

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: TIME_ZONE });
const action = "inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium";

// In-app pricing (PRD F12): Free and Finals; "Get Finals" goes to /pay (bank transfer + WhatsApp).
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
        {/* A warmer top (owner, 22 Nov 2026): the exam countdown, a headline with a reason to act. */}
        <div className="text-center">
          {daysToExams > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#BBEEF0] px-3 py-1 text-[13px] font-medium text-brand">
              <CalendarDays size={15} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
              Exams start {longDate.format(EXAMS_START)} · {daysToExams} {daysToExams === 1 ? "day" : "days"} to go
            </span>
          )}
          <h1 className="mx-auto mt-4 max-w-2xl font-heading text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[44px]">
            {state.plan === "finals" ? "You're on Finals" : "Walk into your exams ready"}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted sm:text-[16px]">
            {state.plan === "finals" && state.endsAt
              ? `Everything is unlocked until ${longDate.format(state.endsAt)}.`
              : FREE_PAST_PROGRAMMES.includes(profile.programme)
                ? "Start free. When exams get close, Finals gives you more questions every day, unlimited summaries and quiz mode."
                : "Start free. When exams get close, Finals gives you more questions every day, quiz mode, and real past questions with worked answers."}
          </p>
        </div>

        <div className="mt-10">
          <PlanTable
            offer={offer}
            current={state.plan}
            freePast={FREE_PAST_PROGRAMMES.includes(profile.programme)}
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
                <GetFinalsLink offer={offer} open={paymentsOpen()} pending={latest?.status === "pending"} />
              )
            }
          />
          {PREMIUM_COURSES_ON && <p className="mt-4 text-center text-sm text-muted">Premium courses are the heaviest courses in your programme.</p>}
          {state.plan === "free" && (
            <div className="mt-4 flex justify-center">
              <PromoCodeToCourses />
            </div>
          )}
        </div>
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
