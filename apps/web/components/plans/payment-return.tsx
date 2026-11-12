"use client";

// After Paystack: checks the payment with our server a few times (a bank transfer can take a
// moment to land), then shows the result. Finals is only ever granted by the server.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

type State = "checking" | "paid" | "pending" | "failed" | "error";

const TRIES = 8;
const WAIT_MS = 2500;

export function PaymentReturn({ reference, pending = false }: { reference: string; pending?: boolean }) {
  const [state, setState] = useState<State>(reference || pending ? "checking" : "error");

  useEffect(() => {
    if (!reference) return;
    let stopped = false;
    (async () => {
      for (let i = 0; i < TRIES && !stopped; i++) {
        const res = await fetch(`/api/pay/verify?reference=${encodeURIComponent(reference)}`, { cache: "no-store" }).catch(() => null);
        const json = res?.ok ? ((await res.json()) as { status: string; plan: string }) : null;
        if (json?.plan === "finals" && json.status === "success") return setState("paid");
        if (json?.status === "failed" || json?.status === "abandoned") return setState("failed");
        if (!res?.ok && res?.status !== 502) return setState("error");
        await new Promise((r) => setTimeout(r, WAIT_MS));
      }
      if (!stopped) setState("pending");
    })();
    return () => {
      stopped = true;
    };
  }, [reference]);

  const copy: Record<State, { title: string; body: string }> = {
    checking: { title: "Confirming your payment…", body: "This takes a few seconds." },
    paid: { title: "You're on Finals", body: "40 messages a day, every course with no limits, unlimited summaries and quiz mode." },
    pending: {
      title: "Still waiting for your bank",
      body: "Transfers and USSD can take a few minutes. Finals switches on by itself as soon as the payment lands; you can keep studying.",
    },
    failed: { title: "The payment didn't go through", body: "Nothing was charged for Finals. You can try again." },
    error: { title: "We couldn't find that payment", body: "If you were charged, Finals switches on by itself within a few minutes." },
  };
  const c = copy[state];

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-card p-8 text-center" role="status" aria-live="polite">
        {state === "checking" && (
          <div className="mb-4 flex justify-center">
            <Spinner />
          </div>
        )}
        <h1 className="text-2xl font-semibold text-ink">{c.title}</h1>
        <p className="mt-3 text-[15px] text-muted">{c.body}</p>
        {state !== "checking" && (
          <Link href="/dashboard" className="mt-6 inline-flex rounded-full bg-brand px-6 py-3 text-[15px] font-medium !text-brand-ink hover:opacity-90">
            Go to my courses
          </Link>
        )}
      </div>
    </main>
  );
}
