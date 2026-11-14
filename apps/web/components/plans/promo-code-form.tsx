"use client";

// "Have a promo code?" (PRD F12, course reps): a quiet link that opens a one-line form. On success
// the caller moves on (onboarding finishes; the Plans page goes to My courses), where the
// "You've got Finals" pop-up greets the student.
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PromoCodeForm({ onRedeemed }: { onRedeemed(): void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/promo/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    const body = await r?.json().catch(() => null);
    if (!r?.ok) {
      setBusy(false);
      return setError(body?.error ?? "Couldn't check that code. Try again.");
    }
    setDone(true);
    onRedeemed();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-pau-50 px-4 py-2 text-[15px] font-medium text-brand ring-1 ring-pau-200 transition hover:bg-pau-100 active:scale-[0.98]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3.5 8.5V6a1.5 1.5 0 0 1 1.5-1.5h14A1.5 1.5 0 0 1 20.5 6v2.5a2.5 2.5 0 0 0 0 5V16a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16v-2.5a2.5 2.5 0 0 0 0-5Z" />
          <path d="M14 7v1.5M14 11.25v1.5M14 15.5V17" />
        </svg>
        Have a promo code?
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-sm" aria-label="Promo code">
      <div className="flex gap-2">
        <label htmlFor="promo-code" className="sr-only">
          Promo code
        </label>
        <input
          id="promo-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="REP-XXXX-XXXX"
          aria-invalid={!!error}
          aria-describedby={error ? "promo-error" : undefined}
          className="min-w-0 flex-1 rounded-full bg-card px-4 py-2.5 font-mono text-[15px] tracking-wider text-ink outline-none ring-1 ring-line-strong focus:ring-2 focus:ring-brand"
        />
        <button type="submit" disabled={busy || !code.trim()} className="shrink-0 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-ink transition hover:opacity-90 disabled:opacity-50">
          {done ? "Applied" : busy ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && (
        <p id="promo-error" role="alert" className="mt-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

/** On a server page (the Plans page): after redeeming, go to My courses, where the pop-up shows. */
export function PromoCodeToCourses() {
  const router = useRouter();
  return (
    <PromoCodeForm
      onRedeemed={() => {
        router.replace("/dashboard");
        router.refresh();
      }}
    />
  );
}
