"use client";

// /pay (PRD F12): transfer to the bank account with your reference, then "Verify Payment" records a
// pending request on the server and opens WhatsApp with the message filled in. Finals is
// switched on only when the owner approves the request.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BusyLabel } from "@/components/ui/spinner";
import { naira, type PlanOffer } from "@/lib/plans/offer";
import { FinalsPrice } from "./finals-price";

interface Pending {
  amount: number;
  reference: string;
  whatsappUrl: string;
}

export function PayForm({
  offer,
  bank,
  reference,
  pending: initialPending,
  rejectedNote,
}: {
  offer: PlanOffer;
  bank: { bankName: string; accountNumber: string; accountName: string };
  reference: string;
  pending: Pending | null;
  /** The last request was rejected: the owner's note ("" when none). */
  rejectedNote: string | null;
}) {
  const [pending, setPending] = useState<Pending | null>(initialPending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const inFlight = useRef(false);
  const id = useId();
  const router = useRouter();
  const amount = useAmountNow(offer);

  // Leaving before paying asks once ("Yes, I'm not ready to lock in"); off once they've sent it.
  const leave = useLeaveGuard(!pending);

  if (pending) return <PendingCard pending={pending} />;

  async function send() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/pay/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(code.trim() ? { referral_code: code.trim() } : {}),
      });
      const json = (await r.json().catch(() => null)) as { amount?: number; reference?: string; whatsapp_url?: string; error?: string } | null;
      if (r.status === 409) {
        router.refresh(); // already on Finals
        return;
      }
      if (!r.ok || !json?.whatsapp_url) throw new Error(json?.error ?? "Couldn't send that. Try again.");
      leave.release();
      setPending({ amount: json.amount!, reference: json.reference!, whatsappUrl: json.whatsapp_url });
      window.location.assign(json.whatsapp_url);
    } catch (e) {
      setError((e as Error).message);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {leave.asking && <LeaveDialog offer={offer} amount={amount} onStay={leave.stay} onLeave={leave.go} />}
      {rejectedNote !== null && (
        <div role="status" className="rounded-[20px] bg-amber-50 p-5 text-[15px] text-amber-900 ring-1 ring-amber-200">
          <p className="font-medium">We couldn&apos;t confirm your last transfer.</p>
          {rejectedNote && <p className="mt-1">{rejectedNote}</p>}
          <p className="mt-1">If you think that&apos;s a mistake, message us on WhatsApp.</p>
        </div>
      )}

      <section className="rounded-[25px] bg-card p-6 ring-2 ring-brand sm:p-7" aria-labelledby="pay-plan">
        <p id="pay-plan" className="text-sm font-medium text-muted">
          Finals · one-time payment
        </p>
        <div className="mt-3">
          <FinalsPrice offer={offer} />
        </div>
      </section>

      <Step n={1} title={`Transfer ${naira(amount)}`}>
        <dl className="mt-3 divide-y divide-line rounded-2xl bg-sunken/60 px-4">
          <Row label="Bank" value={bank.bankName} />
          <Row label="Account number" value={bank.accountNumber} copy mono />
          <Row label="Account name" value={bank.accountName} />
        </dl>
      </Step>

      <Step n={2} title="Put this reference in your transfer description">
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-sunken/60 px-4 py-3">
          <span className="font-mono text-2xl font-semibold tracking-wider text-ink">{reference}</span>
          <CopyButton value={reference} label="reference" />
        </div>
        <p className="mt-2 text-sm text-muted">It&apos;s yours: it tells us the transfer came from you.</p>
      </Step>

      <Step n={3} title="Tell us on WhatsApp">
        <div className="mt-3">
          {showCode ? (
            <div className="mb-3">
              <label htmlFor={id} className="mb-1.5 block text-sm text-muted">
                Referral code (optional)
              </label>
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
            onClick={send}
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          >
            <BusyLabel busy={busy} label="Verify Payment" busyLabel="Opening WhatsApp…" />
          </button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </Step>
    </div>
  );
}

/**
 * "Are you sure?" before leaving /pay without paying (owner's request): in-app links and the back
 * button open our dialog; closing or reloading the tab gets the browser's own prompt (browsers don't
 * allow custom text there).
 */
function useLeaveGuard(active: boolean) {
  const [target, setTarget] = useState<string | null>(null);
  const released = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    released.current = false;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (released.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // Links inside the app (logo, "Plans", …): capture before Next's Link handles the click.
    const onClick = (e: MouseEvent) => {
      if (released.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(url.pathname + url.search + url.hash);
    };
    // Back button: one extra history entry; going back lands on it and opens the dialog instead.
    if (!history.state?.payGuard) history.pushState({ ...history.state, payGuard: true }, "");
    const onPop = () => {
      if (released.current) return;
      history.pushState({ ...history.state, payGuard: true }, "");
      setTarget("back");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [active]);

  return {
    asking: target !== null,
    stay: () => setTarget(null),
    release: () => {
      released.current = true;
    },
    go: () => {
      released.current = true;
      const to = target;
      setTarget(null);
      if (to === "back") history.go(-2); // past our extra entry
      else if (to) router.push(to);
    },
  };
}

function LeaveDialog({ offer, amount, onStay, onLeave }: { offer: PlanOffer; amount: number; onStay(): void; onLeave(): void }) {
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    stay.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onStay();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStay]);
  const early = amount === offer.earlyPrice && offer.early;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4" onClick={onStay}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        aria-describedby="leave-body"
        onClick={(e) => e.stopPropagation()}
        className="pop-in w-full max-w-md rounded-t-[28px] bg-card p-7 shadow-2xl sm:rounded-[28px]"
      >
        <h2 id="leave-title" className="font-heading text-2xl font-semibold tracking-tight text-ink">
          Leave without locking in {naira(amount)}?
        </h2>
        <p id="leave-body" className="mt-2 text-[15px] leading-relaxed text-muted">
          {early ? `The price goes up to ${naira(offer.fullPrice)} after ${offer.priceChangeLabel}. ` : ""}
          Finals gives you {offer.finals.daily} messages a day, unlimited summaries and quiz mode, until your last paper.
        </p>
        <button
          ref={stay}
          type="button"
          onClick={onStay}
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]"
        >
          Stay and lock in {naira(amount)}
        </button>
        <button type="button" onClick={onLeave} className="mt-2 inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-[15px] text-muted transition hover:bg-sunken hover:text-ink">
          Yes, I&apos;m not ready to lock in
        </button>
      </div>
    </div>
  );
}

/** The price to transfer now; re-read in the browser so an open page flips at PRICE_CHANGE_DATE. */
function useAmountNow(offer: PlanOffer) {
  const [amount, setAmount] = useState(offer.price);
  useEffect(() => {
    const tick = () => setAmount(Date.now() < new Date(offer.priceChangeAt).getTime() ? offer.earlyPrice : offer.fullPrice);
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [offer]);
  return amount;
}

function PendingCard({ pending }: { pending: Pending }) {
  return (
    <section role="status" className="rounded-[25px] bg-card p-6 ring-1 ring-line sm:p-7">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[12px] font-semibold text-amber-900">
        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        Payment pending
      </p>
      <p className="mt-4 text-[15px] text-ink">We&apos;ll activate Finals once we confirm your transfer (usually within a few hours).</p>
      <dl className="mt-4 divide-y divide-line rounded-2xl bg-sunken/60 px-4">
        <Row label="Amount" value={naira(pending.amount)} />
        <Row label="Reference" value={pending.reference} mono />
      </dl>
      <a
        href={pending.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex w-full items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium text-ink ring-1 ring-line-strong transition hover:bg-sunken"
      >
        Open WhatsApp again
      </a>
      <a href="/dashboard" className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-medium text-brand-ink hover:opacity-90">
        Keep studying
      </a>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[25px] bg-card p-6 ring-1 ring-line sm:p-7" aria-labelledby={`pay-step-${n}`}>
      <h2 id={`pay-step-${n}`} className="flex items-center gap-3 font-heading text-lg font-semibold text-ink">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-pau-100 text-sm text-pau-800" aria-hidden="true">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, copy = false, mono = false }: { label: string; value: string; copy?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-right">
        <span className={`text-[15px] font-medium text-ink ${mono ? "font-mono tracking-wide" : ""}`}>{value}</span>
        {copy && <CopyButton value={value} label={label.toLowerCase()} />}
      </dd>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers: select-and-copy fallback.
      const t = document.createElement("textarea");
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="shrink-0 rounded-full bg-card px-3 py-1.5 text-[13px] font-medium text-ink ring-1 ring-line-strong transition hover:bg-sunken"
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
