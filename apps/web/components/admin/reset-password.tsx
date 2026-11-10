"use client";

// Owner tool: after a student presses "Escalate to admin" (a prefilled email), set a temporary
// password here and reply to them with it.
import { useState, type FormEvent } from "react";

function suggestPassword(): string {
  const words = ["slide", "study", "exam", "notes", "lecture", "topic", "quiz", "paper"];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function ResetPassword() {
  const [password, setPassword] = useState(suggestPassword);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/admin/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const d = await r.json().catch(() => ({}));
      setResult(r.ok ? { ok: true, text: `Done. Reply to ${email.trim()} with the password: ${password}` } : { ok: false, text: d.error ?? "Couldn't reset it." });
      if (r.ok) setPassword(suggestPassword());
    } catch {
      setResult({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border border-line-strong bg-card px-3 py-2 text-sm text-ink outline-none focus:border-brand";
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-xs text-muted">
        Student&apos;s PAU email
        <input name="email" type="email" required placeholder="name@pau.edu.ng" className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-muted">
        Temporary password
        <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required className={`${input} mt-1 font-mono`} />
      </label>
      <button type="submit" disabled={busy} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-60">
        {busy ? "Saving…" : "Set password"}
      </button>
      {result && <p role="status" className={`text-sm sm:col-span-3 ${result.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700"}`}>{result.text}</p>}
    </form>
  );
}
