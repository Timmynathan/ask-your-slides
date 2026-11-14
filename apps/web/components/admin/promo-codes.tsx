"use client";

// /admin/promo: generate single-use promo codes for course reps, copy them, and see which are used.
// The server creates the codes (/api/admin/promo); redeeming is checked by the database.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PromoCodeRow } from "@/lib/plans/promo";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "";

export function PromoCodes({ codes, defaultDays, maxBatch }: { codes: PromoCodeRow[]; defaultDays: number; maxBatch: number }) {
  const router = useRouter();
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(defaultDays);
  const [note, setNote] = useState("");
  const [fresh, setFresh] = useState<PromoCodeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "unused" | "used">("all");

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/admin/promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, days, note: note || undefined }),
    }).catch(() => null);
    const body = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(body?.error ?? "Couldn't create codes. Try again.");
    setFresh(body.codes);
    startTransition(() => router.refresh());
  }

  const shown = codes.filter((c) => filter === "all" || (filter === "used") === !!c.redeemed_at);
  const used = codes.filter((c) => c.redeemed_at).length;

  return (
    <div className="mt-8 space-y-10">
      <form onSubmit={generate} className="rounded-[24px] bg-card p-5 ring-1 ring-line sm:p-6">
        <h2 className="text-lg font-semibold">New codes</h2>
        <p className="mt-1 text-sm text-muted">Each code works once, for one student. A student can only ever use one promo code.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-[110px_110px_1fr]">
          <label className="text-sm">
            <span className="text-muted">How many</span>
            <input type="number" min={1} max={maxBatch} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-sunken px-3 py-2.5 text-[15px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-brand" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Days of Finals</span>
            <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 w-full rounded-xl bg-sunken px-3 py-2.5 text-[15px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-brand" />
          </label>
          <label className="text-sm">
            <span className="text-muted">Who it&apos;s for (only you see this)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Economics course rep, Tolu" className="mt-1 w-full rounded-xl bg-sunken px-3 py-2.5 text-[15px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-brand" />
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-brand-ink transition hover:opacity-90 disabled:opacity-60">
          {busy ? "Creating…" : count === 1 ? "Generate code" : `Generate ${count} codes`}
        </button>

        {fresh.length > 0 && (
          <div className="mt-6 rounded-2xl bg-pau-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink">
                {fresh.length === 1 ? "Your new code" : `${fresh.length} new codes`} · {fresh[0].days} days of Finals
              </p>
              {fresh.length > 1 && <CopyButton text={fresh.map((c) => c.code).join("\n")} label="Copy all" />}
            </div>
            <ul className="mt-3 space-y-2">
              {fresh.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-2.5 ring-1 ring-line">
                  <span className="font-mono text-[16px] tracking-wider">{c.code}</span>
                  <CopyButton text={c.code} label="Copy" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      <section aria-labelledby="codes-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="codes-title" className="text-lg font-semibold">
            All codes <span className="text-muted">({used} used of {codes.length})</span>
          </h2>
          <div className="inline-flex rounded-full bg-sunken p-1 text-[13px]" role="tablist" aria-label="Filter codes">
            {(["all", "unused", "used"] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1 capitalize transition ${filter === f ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-card p-6 text-muted ring-1 ring-line">No codes here yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl bg-card ring-1 ring-line">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-normal">Code</th>
                  <th className="px-4 py-3 font-normal">For</th>
                  <th className="px-4 py-3 font-normal">Days</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal" aria-label="Copy" />
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-mono tracking-wider">{c.code}</td>
                    <td className="px-4 py-3 text-muted">{c.note ?? "—"}</td>
                    <td className="px-4 py-3">{c.days}</td>
                    <td className="px-4 py-3">
                      {c.redeemed_at ? (
                        <span>
                          <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[12px] text-muted">Used</span>{" "}
                          <span className="text-muted">{c.redeemed_email ?? "deleted account"} · {when(c.redeemed_at)}</span>
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] text-emerald-800">Unused</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{!c.redeemed_at && <CopyButton text={c.code} label="Copy" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      className="shrink-0 rounded-full px-3 py-1 text-[13px] text-brand ring-1 ring-line transition hover:bg-sunken"
    >
      {done ? "Copied" : label}
    </button>
  );
}
