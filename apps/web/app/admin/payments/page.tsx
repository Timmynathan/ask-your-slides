import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { PaymentRequests } from "@/components/admin/payment-requests";
import { isAdminEmail } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";
import { PLAN_END_DATE } from "@/lib/plans/config";
import { listRequests } from "@/lib/plans/payment-admin";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Payments · Admin · Ask Your Slides", robots: { index: false, follow: false } };

// Owner-only (ADMIN_EMAILS), checked here on every request as well as in the proxy; anyone else
// gets a 404. Pending bank-transfer requests, newest first: Approve grants Finals until
// PLAN_END_DATE, Reject records a note the student sees on /pay.
async function Loaded() {
  const { user } = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const { pending, recent } = await listRequests(adminClient());
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" aria-label="Admin dashboard">
            <Logo size={24} />
          </Link>
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-ink">Admin</span>
          <Link href="/admin" className="ml-auto rounded-full px-3 py-1.5 text-sm text-muted hover:bg-sunken hover:text-ink">
            Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="text-[28px] tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-muted">
          Check the transfer in Opay (amount, reference) against the student&apos;s WhatsApp message, then approve. Approving switches on Finals until{" "}
          {PLAN_END_DATE.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" })} ; the student sees a pop-up next time they open the app.
        </p>
        <PaymentRequests pending={pending} recent={recent} />
      </main>
    </div>
  );
}

export default function AdminPaymentsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
