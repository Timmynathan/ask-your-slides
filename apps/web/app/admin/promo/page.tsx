import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { PromoCodes } from "@/components/admin/promo-codes";
import { isAdminEmail } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";
import { PROMO_DAYS, PROMO_MAX_BATCH } from "@/lib/plans/config";
import { listPromoCodes } from "@/lib/plans/promo";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Promo codes · Admin · Ask Your Slides", robots: { index: false, follow: false } };

// Owner-only (ADMIN_EMAILS), checked here on every request as well as in the proxy; anyone else
// gets a 404. Promo codes for course reps: single use, PROMO_DAYS of Finals by default (PRD F12).
async function Loaded() {
  const { user } = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const codes = await listPromoCodes(adminClient());
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" aria-label="Admin dashboard">
            <Logo size={24} />
          </Link>
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-ink">Admin</span>
          <Link href="/admin/payments" className="ml-auto rounded-full px-3 py-1.5 text-sm text-muted hover:bg-sunken hover:text-ink">
            Payments
          </Link>
          <Link href="/admin" className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-sunken hover:text-ink">
            Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="text-[28px] tracking-tight">Promo codes</h1>
        <p className="mt-1 text-sm text-muted">
          For course reps: send a code on WhatsApp. They type it in when they sign up, or on the Plans page, and get Finals for the code&apos;s days. Then they go back to Free on their own.
        </p>
        <PromoCodes codes={codes} defaultDays={PROMO_DAYS} maxBatch={PROMO_MAX_BATCH} />
      </main>
    </div>
  );
}

export default function AdminPromoPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
