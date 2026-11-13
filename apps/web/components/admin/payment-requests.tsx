"use client";

// /admin/payments: pending requests (newest first) with Approve / Reject, then recent decisions.
// The server decides everything; a click in flight disables the row's buttons, and the database
// grants once per request even if two clicks get through.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AdminRequestRow } from "@/lib/plans/payment-admin";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }) : "";
const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

export function PaymentRequests({ pending, recent }: { pending: AdminRequestRow[]; recent: AdminRequestRow[] }) {
  return (
    <div className="mt-8 space-y-12">
      <section aria-labelledby="pending-title">
        <h2 id="pending-title" className="text-lg font-semibold">
          Pending <span className="text-muted">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-card p-6 text-muted ring-1 ring-line">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((r) => (
              <PendingRow key={r.id} r={r} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-title">
        <h2 id="recent-title" className="text-lg font-semibold">
          Recent decisions
        </h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-muted">None yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl bg-card ring-1 ring-line">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  {["Email", "Reference", "Amount", "Referral", "Status", "Decided"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">{r.email}</td>
                    <td className="px-4 py-3 font-mono">{r.reference}</td>
                    <td className="px-4 py-3">{naira(r.amount_naira)}</td>
                    <td className="px-4 py-3">{r.referral_code ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={r.status === "approved" ? "text-emerald-700" : "text-red-700"}>{r.status}</span>
                      {r.note && <span className="block text-[12px] text-muted">{r.note}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{when(r.decided_at)}</td>
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

function PendingRow({ r }: { r: AdminRequestRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  async function decide(action: "approve" | "reject") {
    if (busy) return;
    if (action === "approve" && !confirm(`Approve ${naira(r.amount_naira)} from ${r.email} (${r.reference})? This switches on Finals.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action, note: action === "reject" ? note : undefined }),
      });
      const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
      setMessage({ ok: res.ok, text: json?.message ?? json?.error ?? `Failed (${res.status})` });
      if (res.ok) startTransition(() => router.refresh());
      else setBusy(false);
    } catch {
      setMessage({ ok: false, text: "Network error. Try again." });
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl bg-card p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-5">
          <Field label="Email" value={r.email} wide />
          <Field label="Reference" value={r.reference} mono />
          <Field label="Amount" value={naira(r.amount_naira)} />
          <Field label="Referral" value={r.referral_code ?? "—"} />
          <Field label="Sent" value={when(r.created_at)} />
        </dl>
        {!rejecting && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide("approve")}
              className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-ink transition hover:opacity-90 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="rounded-full px-5 py-2 text-sm text-ink ring-1 ring-line-strong transition hover:bg-sunken disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor={`note-${r.id}`} className="sr-only">
            Note for the student (optional)
          </label>
          <input
            id={`note-${r.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Note for the student (optional), e.g. No transfer with this reference"
            className="min-w-0 flex-1 rounded-full bg-sunken/70 px-4 py-2 text-sm outline-none ring-pau-200 focus:ring-2"
          />
          <button type="button" disabled={busy} onClick={() => decide("reject")} className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            Reject request
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting(false)} className="rounded-full px-4 py-2 text-sm text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      )}
      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
          {message.text}
        </p>
      )}
    </li>
  );
}

function Field({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-1" : ""}>
      <dt className="text-muted">{label}</dt>
      <dd className={`break-all text-ink ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
