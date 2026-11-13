import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { PayForm } from "@/components/plans/pay-form";
import { requireUser } from "@/lib/auth/session";
import { PLAN_END_DATE, TIME_ZONE } from "@/lib/plans/config";
import { planState } from "@/lib/plans/entitlement";
import { latestRequest, paymentDetails, referenceFor, whatsappText, whatsappUrl } from "@/lib/plans/manual-pay";
import { planOffer } from "@/lib/plans/offer";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Get Finals · Ask Your Slides" };

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: TIME_ZONE });
const action = "inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium";

// Paying for Finals (PRD F12): bank transfer with the student's reference, then the receipt on
// WhatsApp. "I've sent it" records a pending request; an admin approves it in /admin/payments.
async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("onboarded, programme").eq("id", user.id).single();
  if (!profile?.onboarded || !profile.programme) redirect(`/welcome?next=${encodeURIComponent("/pay")}`);

  const db = adminClient();
  const now = new Date();
  const details = paymentDetails();
  const [state, latest] = await Promise.all([planState(db, user.id, now), latestRequest(db, user.id)]);
  const offer = planOffer(now);
  const email = (user.email ?? "").toLowerCase();

  let body: React.ReactNode;
  if (state.plan === "finals") {
    body = (
      <Notice title={`You're on Finals until ${longDate.format(state.endsAt!)}.`}>
        <Link href="/dashboard" className={`${action} mt-6 bg-brand text-brand-ink hover:opacity-90`}>
          Go to my courses
        </Link>
      </Notice>
    );
  } else if (now >= PLAN_END_DATE) {
    body = <Notice title="Finals for this semester has ended.">Keep studying free; Finals comes back next semester.</Notice>;
  } else if (!details) {
    body = <Notice title="Payments open soon.">Finals goes on sale shortly. Keep studying free in the meantime.</Notice>;
  } else {
    const reference = await referenceFor(db, user.id);
    const pending = latest?.status === "pending" ? latest : null;
    body = (
      <PayForm
        offer={offer}
        bank={{ bankName: details.bankName, accountNumber: details.accountNumber, accountName: details.accountName }}
        reference={reference}
        pending={
          pending
            ? {
                amount: pending.amount_naira,
                reference: pending.reference,
                whatsappUrl: whatsappUrl(details.whatsapp, whatsappText({ amount: pending.amount_naira, email, reference: pending.reference })),
              }
            : null
        }
        rejectedNote={latest?.status === "rejected" ? (latest.note ?? "") : null}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/dashboard" aria-label="My courses">
          <Logo />
        </Link>
        <Link href="/pricing" className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-sunken hover:text-ink">
          Plans
        </Link>
      </header>
      <main className="mx-auto max-w-lg px-4 pb-20 pt-4 sm:px-5">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-ink">Get Finals</h1>
        <div className="mt-6">{body}</div>
      </main>
    </div>
  );
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[25px] bg-card p-7 ring-1 ring-line">
      <p className="font-heading text-xl font-semibold text-ink">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
