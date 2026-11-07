"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Sign-in (PRD F1):
//   usual:          email + password
//   first time /    email → emailed code (proves the PAU address) → create a password
//   forgot password
type Step =
  | { kind: "password" }
  | { kind: "code-email" }
  | { kind: "code"; email: string }
  | { kind: "new-password"; email: string };

const MIN_PASSWORD = 8;

export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Remember the email on this browser.
  const [savedEmail, setSavedEmail] = useState("");
  useEffect(() => {
    try {
      const v = localStorage.getItem("pau.email");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
      if (v) setSavedEmail(v);
    } catch {
      /* storage blocked: just don't prefill */
    }
  }, []);

  function remember(email: string) {
    try {
      localStorage.setItem("pau.email", email);
    } catch {
      /* storage blocked */
    }
  }

  function go(next: Step) {
    setError(null);
    setShowPassword(false);
    setStep(next);
  }

  async function post(url: string, body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Something went wrong. Try again.");
      return res.ok ? data : null;
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function finish(next: string | undefined) {
    router.replace(next ?? "/dashboard");
    router.refresh();
  }

  async function signIn(form: FormData) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const data = await post("/api/auth/password", { email, password: String(form.get("password") ?? "") });
    if (!data) return;
    remember(email);
    finish(data.next);
  }

  async function sendCode(form: FormData) {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const data = await post("/api/auth/otp", { email });
    if (!data) return;
    remember(email);
    setSavedEmail(email);
    go({ kind: "code", email });
  }

  async function verify(form: FormData) {
    if (step.kind !== "code") return;
    const data = await post("/api/auth/verify", { email: step.email, code: String(form.get("code") ?? "") });
    if (data) go({ kind: "new-password", email: step.email });
  }

  async function setPassword(form: FormData) {
    const password = String(form.get("password") ?? "");
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    const data = await post("/api/auth/set-password", { password });
    if (data) finish(data.next);
  }

  const input =
    "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-200";
  const button =
    "mt-4 w-full rounded-lg bg-neutral-900 px-3 py-2.5 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900";
  const link = "text-sm text-neutral-700 underline underline-offset-2 dark:text-neutral-300";
  const emailField = (
    <>
      <label htmlFor="email" className="text-sm font-medium">
        PAU email
      </label>
      <input id="email" name="email" type="email" inputMode="email" autoComplete="username" required
        key={savedEmail} defaultValue={savedEmail} placeholder="you@pau.edu.ng" className={input} />
    </>
  );
  const passwordField = (id: string, label: string, autoComplete: string, hint?: string) => (
    <>
      <div className="mt-4 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-xs text-neutral-600 dark:text-neutral-400">
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <input id={id} name="password" type={showPassword ? "text" : "password"} autoComplete={autoComplete} required
        minLength={autoComplete === "new-password" ? MIN_PASSWORD : undefined} className={input} />
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </>
  );

  return (
    <div className="mt-8">
      {step.kind === "password" && (
        <form action={signIn} noValidate>
          {emailField}
          {passwordField("password", "Password", "current-password")}
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-5 text-center text-sm text-neutral-600 dark:text-neutral-400">
            First time here, or forgot your password?{" "}
            <button type="button" onClick={() => go({ kind: "code-email" })} className={link}>
              Get a code
            </button>
          </p>
        </form>
      )}

      {step.kind === "code-email" && (
        <form action={sendCode} noValidate>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            We&apos;ll email a code to your PAU address. Then you&apos;ll set a password for next time.
          </p>
          {emailField}
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Sending…" : "Send code"}
          </button>
          <button type="button" onClick={() => go({ kind: "password" })} className={`${link} mt-4 block w-full text-center`}>
            Back to sign in
          </button>
        </form>
      )}

      {step.kind === "code" && (
        <form action={verify} noValidate>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            We sent a code to <span className="font-medium text-neutral-900 dark:text-neutral-100">{step.email}</span>. It can
            take a minute; check your spam folder too.
          </p>
          <label htmlFor="code" className="mt-4 block text-sm font-medium">
            Code
          </label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10}
            required autoFocus className={`${input} tracking-[0.3em]`} />
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Checking…" : "Continue"}
          </button>
          <button type="button" onClick={() => go({ kind: "code-email" })} className={`${link} mt-4 block w-full text-center`}>
            Use a different email
          </button>
        </form>
      )}

      {step.kind === "new-password" && (
        <form action={setPassword} noValidate>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">
            Email confirmed. Choose a password so you can sign in with{" "}
            <span className="font-medium text-neutral-900 dark:text-neutral-100">{step.email}</span> next time, without a code.
          </p>
          {/* Lets password managers save the pair. */}
          <input type="email" name="username" autoComplete="username" value={step.email} readOnly hidden />
          {passwordField("new-password", "New password", "new-password", `At least ${MIN_PASSWORD} characters.`)}
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Saving…" : "Save password and continue"}
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
