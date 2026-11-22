"use client";

// Finals students get this in place of the Upgrade card (owner, 22 Nov 2026): the same teal, with a
// short word of encouragement that's different on every visit and gently rotates every few seconds
// (fade and lift, like the best study apps' daily nudges). Dots let the student flip through. With
// "reduce motion" on, it changes without the movement and doesn't rotate on its own.
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

const LINES: ((name: string, days: number) => string)[] = [
  (n) => `You've got this${n ? `, ${n}` : ""}.`,
  () => "One lecture today beats five tomorrow.",
  () => "Small steps every day. That's how A's are built.",
  () => "You don't have to be perfect. Just keep showing up.",
  () => "Future you is already thanking you.",
  () => "Understand it once, and it stays with you.",
  () => "Hard topic? Good. That's where you grow.",
  (_, d) => (d > 1 ? `${d} days is plenty if you start today.` : "Today counts. Make it a good one."),
  () => "Focus on the next slide, not the whole course.",
  () => "Consistency beats cramming. Every time.",
  () => "Rest counts too. Come back fresh.",
  () => "Every question you ask moves you forward.",
  (n) => `${n ? `${n}, you're` : "You're"} more ready than you think.`,
  () => "Start small. Momentum does the rest.",
  () => "Proud of you for being here.",
];
const ROTATE_MS = 7000;

export function EncourageCard({ name, examsInDays }: { name: string | null; examsInDays: number }) {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const lines = useMemo(() => LINES.map((f) => f(first, examsInDays)), [first, examsInDays]);
  // A different starting line on every visit (picked after hydration, so server and browser agree).
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setI(Math.floor(Math.random() * lines.length));
      setShown(true);
    }, 0);
    return () => clearTimeout(t);
  }, [lines.length]);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduce || paused || !shown) return;
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [lines.length, paused, shown]);

  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-[#BBEEF0] p-6 text-brand"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* Soft light drifting behind the words. */}
      <span aria-hidden className="encourage-glow pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/40 blur-2xl" />
      <p className="relative flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide text-brand/70">
        <Sparkles size={16} absoluteStrokeWidth strokeWidth={1.6} className="encourage-twinkle" aria-hidden />
        Finals mode
      </p>
      <p aria-live="polite" className="relative mt-3 min-h-[3.4em] font-heading text-[22px] leading-snug">
        <span key={i} className={shown ? "encourage-in inline-block" : "opacity-0"}>
          {lines[i]}
        </span>
      </p>
      <div className="relative mt-4 flex gap-1.5" aria-label="More encouragement">
        {[0, 1, 2, 3, 4].map((k) => {
          const target = (i - (i % 5) + k) % lines.length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setI(target)}
              aria-label={`Show message ${k + 1}`}
              className={`h-1.5 rounded-full transition-all ${i % 5 === k ? "w-5 bg-brand" : "w-1.5 bg-brand/30 hover:bg-brand/50"}`}
            />
          );
        })}
      </div>
    </div>
  );
}
