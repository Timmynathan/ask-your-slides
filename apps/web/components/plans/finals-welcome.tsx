"use client";

// "You're on Finals" (PRD F12): shown once, the first time the student opens the app after the
// owner approves their payment in /admin/payments (no email: PAU inboxes don't reliably get ours).
// Remembered per plan in this browser; if storage is blocked it simply shows again next time.
// A celebration: confetti bursts, a glowing badge, perks that pop in one by one. All of it is CSS
// (globals.css, "Finals welcome") and stays still for reduced motion.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";

// Minimal line icons (24px grid, 1.6 stroke), matching the app's other icons.
const ICONS = {
  chat: "M5 5.5h14v10H9.5L5 19.5z",
  books: "M5 4.5h4v15H5zM10 4.5h4v15h-4zM15.2 5.3l3.8-1 3 14.6-3.8 1z",
  paper: "M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12h5M10 15.5h5",
  spark: "M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z",
  target: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z",
  calendar: "M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4",
  cap: "M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.5v4.5c3.5 2.5 7.5 2.5 11 0v-4.5M21.5 9.5v5",
} as const;

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const key = (id: string) => `ays:finals-welcome:${id}`;
const COLORS = ["#f5b700", "#ff5c8a", "#2bd9a0", "#5ea3ed", "#9b6bff", "#ff8a3d", "#ffffff"];

// Deterministic pseudo-random, so server and client agree and every opening looks the same.
function confetti(count: number, seed: number) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: count }, (_, i) => ({
    left: `${r() * 100}%`,
    color: COLORS[i % COLORS.length],
    w: 6 + Math.round(r() * 6),
    h: r() > 0.5 ? 6 + Math.round(r() * 4) : 12 + Math.round(r() * 8),
    round: r() > 0.7,
    delay: `${Math.round(r() * 900) + (i % 2 ? 0 : 1600)}ms`,
    dur: `${2400 + Math.round(r() * 1800)}ms`,
    drift: `${Math.round((r() - 0.5) * 220)}px`,
    spin: `${Math.round(360 + r() * 720) * (r() > 0.5 ? 1 : -1)}deg`,
  }));
}

export function FinalsWelcome({ id, endsAt, daily }: { id: string; endsAt: string; daily: number }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pieces = useMemo(() => confetti(70, 7), []);

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
    button.current?.focus({ preventScroll: true });
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
  const perks: { icon: string; text: string }[] = [
    { icon: ICONS.chat, text: `${daily} messages a day` },
    { icon: ICONS.books, text: "All your courses, no limits on premium courses" },
    ...(PAST_QUESTIONS_LIVE ? [{ icon: ICONS.paper, text: "Every past question, with model answers and marked practice" }] : []),
    { icon: ICONS.spark, text: "Unlimited summaries" },
    { icon: ICONS.target, text: "Quiz mode: get quizzed on any topic" },
    { icon: ICONS.calendar, text: `Valid until ${until}` },
  ];

  return createPortal(
    <div className="welcome-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:px-4" onClick={close}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={
              {
                left: p.left,
                width: p.w,
                height: p.h,
                background: p.color,
                borderRadius: p.round ? "999px" : "2px",
                "--delay": p.delay,
                "--dur": p.dur,
                "--drift": p.drift,
                "--spin": p.spin,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onClick={(e) => e.stopPropagation()}
        className="welcome-card relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card shadow-2xl sm:rounded-[28px]"
      >
        <div className="relative overflow-hidden bg-brand px-7 pb-7 pt-8 text-center text-brand-ink">
          <span className="welcome-spark" style={{ top: "18%", left: "14%" }} aria-hidden="true">✦</span>
          <span className="welcome-spark" style={{ top: "30%", right: "12%", animationDelay: "0.6s" }} aria-hidden="true">✦</span>
          <span className="welcome-spark" style={{ bottom: "18%", left: "24%", animationDelay: "1.1s" }} aria-hidden="true">✦</span>
          <div className="welcome-badge mx-auto flex size-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/25">
            <Icon d={ICONS.cap} size={36} />
          </div>
          <p className="welcome-rise mt-5 inline-flex rounded-full bg-white/20 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider" style={{ animationDelay: "250ms" }}>
            Payment confirmed
          </p>
          <h2 id="welcome-title" className="welcome-rise mt-3 font-heading text-4xl font-semibold tracking-tight" style={{ animationDelay: "380ms" }}>
            You&apos;re on Finals!
          </h2>
          <p className="welcome-rise mt-2 text-[15px] text-white/85" style={{ animationDelay: "500ms" }}>
            Thanks for paying. Everything is unlocked. Go ace those exams.
          </p>
        </div>
        <div className="px-7 pb-7 pt-6">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-muted">What you get now</p>
          <ul className="mt-4 space-y-2 text-[15px] text-ink">
            {perks.map((p, i) => (
              <li key={p.text} className="welcome-perk flex items-center gap-3 rounded-2xl bg-pau-50 px-3.5 py-2" style={{ animationDelay: `${650 + i * 110}ms` }}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-brand shadow-sm">
                  <Icon d={p.icon} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          <button
            ref={button}
            type="button"
            onClick={close}
            className="cta-shine welcome-rise mt-7 inline-flex w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-[15px] font-semibold text-brand-ink transition hover:opacity-90 active:scale-[0.98]"
            style={{ animationDelay: `${700 + perks.length * 110}ms` }}
          >
            Start studying
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
