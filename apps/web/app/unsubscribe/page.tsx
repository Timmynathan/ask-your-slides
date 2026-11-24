import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { validUnsubscribe } from "@/lib/email/send";

// From the "Unsubscribe" link in an update email (no login). Opening the page changes nothing (link
// scanners open every link); the button does. Sign-in codes are always sent.
export const metadata: Metadata = { title: "Email updates · Ask Your Slides", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ u?: string; t?: string; done?: string }> };

async function Loaded({ searchParams }: Props) {
  const { u = "", t = "", done } = await searchParams;
  const ok = /^[0-9a-f-]{36}$/.test(u) && validUnsubscribe(u, t);
  const action = (resubscribe: boolean) => `/api/email/unsubscribe?u=${u}&t=${encodeURIComponent(t)}&from=page${resubscribe ? "&action=resubscribe" : ""}`;
  const button = "mt-6 inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-medium transition";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo />
      {!ok ? (
        <>
          <h1 className="mt-8 font-heading text-3xl font-semibold tracking-tight text-ink">This link isn&apos;t valid</h1>
          <p className="mt-3 text-muted">You can turn update emails off in Settings after signing in.</p>
          <Link href="/settings" className={`${button} bg-brand text-brand-ink hover:opacity-90`}>Open Settings</Link>
        </>
      ) : done === "off" ? (
        <>
          <h1 className="mt-8 font-heading text-3xl font-semibold tracking-tight text-ink">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-muted">We won&apos;t send you update emails. Sign-in codes still arrive when you ask for one.</p>
          <form method="post" action={action(true)}>
            <button className={`${button} text-ink ring-1 ring-line-strong hover:bg-sunken`}>Turn updates back on</button>
          </form>
        </>
      ) : done === "on" ? (
        <>
          <h1 className="mt-8 font-heading text-3xl font-semibold tracking-tight text-ink">Updates are back on</h1>
          <p className="mt-3 text-muted">Thanks. We only email when something useful arrives for your courses.</p>
          <Link href="/dashboard" className={`${button} bg-brand text-brand-ink hover:opacity-90`}>Go to my courses</Link>
        </>
      ) : (
        <>
          <h1 className="mt-8 font-heading text-3xl font-semibold tracking-tight text-ink">Stop update emails?</h1>
          <p className="mt-3 text-muted">We email only when something new arrives for your courses, at most twice a week.</p>
          <form method="post" action={action(false)}>
            <button className={`${button} bg-brand text-brand-ink hover:opacity-90`}>Unsubscribe</button>
          </form>
        </>
      )}
    </main>
  );
}

export default function UnsubscribePage(props: Props) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-page" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
