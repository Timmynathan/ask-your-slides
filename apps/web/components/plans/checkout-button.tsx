"use client";

// "Get Finals": an optional referral code, then off to Paystack. The server sets the price and
// creates the payment; this only forwards the student to Paystack's page.
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { BusyLabel } from "@/components/ui/spinner";
import { naira } from "@/lib/plans/offer";

export function CheckoutButton({ price, autoFocus = false, openReferral = false }: { price: number; autoFocus?: boolean; openReferral?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(openReferral);
  const [code, setCode] = useState("");
  const inFlight = useRef(false);
  const id = useId();
  const router = useRouter();

  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/pay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(code.trim() ? { referral_code: code.trim() } : {}),
      });
      const json = (await r.json().catch(() => null)) as { authorization_url?: string; error?: string } | null;
      if (r.status === 409) {
        router.push("/dashboard"); // already on Finals
        return;
      }
      if (!r.ok || !json?.authorization_url) throw new Error(json?.error ?? "Couldn't start the payment. Try again.");
      window.location.assign(json.authorization_url);
    } catch (e) {
      setError((e as Error).message);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      {showCode ? (
        <div className="mb-3">
          <label htmlFor={id} className="mb-1.5 block text-sm text-muted">Referral code (optional)</label>
          <input
            id={id}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={32}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="e.g. TOLU"
            className="w-full rounded-full bg-sunken/70 px-5 py-3 text-[15px] text-ink outline-none ring-pau-200 placeholder:text-muted focus:ring-2"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowCode(true)} className="mb-3 text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          Have a referral code?
        </button>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        autoFocus={autoFocus}
        className="inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
      >
        <BusyLabel busy={busy} label={`Get Finals · ${naira(price)}`} busyLabel="Opening Paystack…" />
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
