"use client";

// "You're on Finals" (PRD F12): shown once, the first time the student opens the app after the
// owner approves their payment in /admin/payments (no email: PAU inboxes don't reliably get ours).
// Remembered per plan in this browser; if storage is blocked it simply shows again next time.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "./plan-cards";

const key = (id: string) => `ays:finals-welcome:${id}`;

export function FinalsWelcome({ id, endsAt, daily }: { id: string; endsAt: string; daily: number }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(key(id)) !== null;
    } catch {}
    // Runs once after mount: reading storage has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!seen) setOpen(true);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close() {
    try {
      localStorage.setItem(key(id), new Date().toISOString());
    } catch {}
    setOpen(false);
  }

  if (!open) return null;
  const until = new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });
  const perks = [`${daily} messages a day`, "All your courses, no limits on premium courses", "Unlimited summaries", "Quiz mode: get quizzed on any topic", `Valid until ${until}`];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onClick={(e) => e.stopPropagation()}
        className="pop-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card p-7 shadow-2xl sm:rounded-[28px]"
      >
        <p className="inline-flex rounded-full bg-pau-100 px-3 py-1 text-[12px] font-semibold text-pau-800">Payment confirmed</p>
        <h2 id="welcome-title" className="mt-4 font-heading text-3xl font-semibold tracking-tight text-ink">
          You&apos;re on Finals
        </h2>
        <p className="mt-2 text-[15px] text-muted">Thanks for paying. Here&apos;s what you get now:</p>
        <ul className="mt-5 space-y-3 text-[15px] text-ink">
          {perks.map((p) => (
            <li key={p} className="flex gap-3">
              <CheckIcon />
              {p}
            </li>
          ))}
        </ul>
        <button
          ref={button}
          type="button"
          onClick={close}
          className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98]"
        >
          Start studying
        </button>
      </div>
    </div>,
    document.body,
  );
}
