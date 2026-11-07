"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = { kind: "email" } | { kind: "code"; email: string };

export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "email" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: object) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function sendCode(form: FormData) {
    setBusy(true);
    setError(null);
    const email = String(form.get("email") ?? "");
    const { ok, data } = await post("/api/auth/otp", { email });
    setBusy(false);
    if (!ok) return setError(data.error ?? "Something went wrong. Try again.");
    setStep({ kind: "code", email: email.trim().toLowerCase() });
  }

  async function verify(form: FormData) {
    if (step.kind !== "code") return;
    setBusy(true);
    setError(null);
    const { ok, data } = await post("/api/auth/verify", { email: step.email, code: String(form.get("code") ?? "") });
    if (!ok) {
      setBusy(false);
      return setError(data.error ?? "Something went wrong. Try again.");
    }
    router.replace(data.next ?? "/dashboard");
    router.refresh();
  }

  const input =
    "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-200";
  const button =
    "mt-4 w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";

  return (
    <div className="mt-8">
      {step.kind === "email" ? (
        <form action={sendCode} noValidate>
          <label htmlFor="email" className="text-sm font-medium">
            PAU email
          </label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required
            placeholder="you@pau.edu.ng" className={input} />
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form action={verify} noValidate>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            We sent a code to <span className="font-medium text-neutral-900 dark:text-neutral-100">{step.email}</span>.
            It can take a minute; check your spam folder too.
          </p>
          <label htmlFor="code" className="mt-4 block text-sm font-medium">
            Code
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
            required autoFocus className={`${input} tracking-[0.3em]`} />
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button type="button" onClick={() => { setStep({ kind: "email" }); setError(null); }}
            className="mt-3 w-full text-sm text-neutral-600 underline dark:text-neutral-400">
            Use a different email
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
