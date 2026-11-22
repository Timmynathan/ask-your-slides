"use client";

// Text that types itself out, a letter at a time (owner, 22 Nov 2026): the study partner's greeting in
// every chat and the dashboard's speech bubbles. The box has its final size from the start, so nothing
// below it jumps. Screen readers get the whole text
// at once; with "reduce motion" on it simply appears.
import Link from "next/link";
import { useEffect, useState } from "react";

/** A run of text: plain, bold, or a link (shown bold and underlined). */
export type TypePart = string | { text: string; bold?: boolean; href?: string };

const MS_PER_CHAR = 22;

export function Typewriter({ parts, delay = 0, onDone, className = "" }: { parts: TypePart[]; delay?: number; onDone?(): void; className?: string }) {
  const runs = parts.map((p) => (typeof p === "string" ? { text: p } : p));
  const total = runs.reduce((n, r) => n + r.text.length, 0);
  const key = runs.map((r) => r.text).join("");
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      n = Math.min(total, n + 1);
      setShown(n);
      if (n < total) timer = setTimeout(tick, MS_PER_CHAR);
      else onDone?.();
    };
    if (reduce) {
      timer = setTimeout(() => {
        setShown(total);
        onDone?.();
      }, delay);
    } else {
      timer = setTimeout(() => {
        setShown(0);
        tick();
      }, delay);
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the text changes
  }, [key, total, delay]);

  // Every letter is laid out from the start in its final place; the ones not typed yet are just
  // transparent, so the text never shifts (centred lines included) and the box never resizes.
  const render = (limit: number) => {
    let left = limit;
    return runs.map((r, i) => {
      const cut = Math.max(0, Math.min(r.text.length, left));
      left -= r.text.length;
      const typed = r.text.slice(0, cut);
      const rest = r.text.slice(cut);
      const body = (
        <>
          {typed}
          {rest && <span className="text-transparent">{rest}</span>}
        </>
      );
      if (r.href)
        return cut === r.text.length ? (
          <Link key={i} href={r.href} className="font-semibold text-ink underline decoration-[1.5px] underline-offset-[3px] hover:text-brand">
            {body}
          </Link>
        ) : (
          <span key={i} className="font-semibold text-ink">{body}</span>
        );
      if (r.bold) return <strong key={i} className="font-semibold text-ink">{body}</strong>;
      return <span key={i}>{body}</span>;
    });
  };

  if (shown >= total) return <span className={className}>{render(total)}</span>;
  return (
    <span className={className}>
      <span className="sr-only">{key}</span>
      <span aria-hidden>{render(shown)}</span>
    </span>
  );
}
