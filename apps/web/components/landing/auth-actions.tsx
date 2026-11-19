import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

// The landing page is open to signed-in students too (owner, 17 Nov 2026): the dashboard logo leads
// here. Signed in, the "Log in / Try for free" buttons become one "Dashboard" button. The page shell
// stays static: only these buttons read the session, inside <Suspense>, with the signed-out
// buttons as the fallback.

async function signedIn(): Promise<boolean> {
  const supabase = await createClient();
  // getClaims() verifies the session JWT locally: no round trip to Supabase Auth.
  const { data } = await supabase.auth.getClaims();
  return !!data?.claims?.sub;
}

const brandPill = "type-menu rounded-full bg-brand px-5 py-2.5 !text-brand-ink hover:opacity-90";

function NavSignedOut() {
  return (
    <div className="flex items-center gap-2">
      <Link href="/sign-in" className="type-menu hidden rounded-full border border-line-strong px-5 py-2.5 hover:bg-sunken sm:inline-flex">
        Log in
      </Link>
      <Link href="/sign-up" className={brandPill}>
        Try for free
      </Link>
    </div>
  );
}

async function Nav() {
  if (!(await signedIn())) return <NavSignedOut />;
  return (
    <div className="flex items-center gap-2">
      <Link href="/dashboard" className={brandPill}>
        Dashboard
      </Link>
    </div>
  );
}

/** Top-right of the landing nav: Log in + Try for free, or Dashboard when signed in. */
export function NavActions() {
  return (
    <Suspense fallback={<NavSignedOut />}>
      <Nav />
    </Suspense>
  );
}

const heroButton = "mt-8 inline-flex items-center justify-center rounded-full bg-brand px-8 py-3.5 text-base font-medium text-brand-ink hover:opacity-90 sm:mt-10 sm:px-10 sm:py-4";

function HeroSignedOut({ seeHow }: { seeHow: React.ReactNode }) {
  return (
    <>
      <Link href="/sign-up" className={heroButton}>
        Try for free
      </Link>
      {seeHow}
      <p className="mt-2 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  );
}

async function Hero({ seeHow }: { seeHow: React.ReactNode }) {
  if (!(await signedIn())) return <HeroSignedOut seeHow={seeHow} />;
  return (
    <>
      <Link href="/dashboard" className={heroButton}>
        Go to your dashboard
      </Link>
      {seeHow}
    </>
  );
}

/** The hero's main button: Try for free (+ Log in), or Go to your dashboard when signed in. */
export function HeroActions({ seeHow }: { seeHow: React.ReactNode }) {
  return (
    <Suspense fallback={<HeroSignedOut seeHow={seeHow} />}>
      <Hero seeHow={seeHow} />
    </Suspense>
  );
}
