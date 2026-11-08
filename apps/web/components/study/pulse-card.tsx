"use client";

// PRD F7: "Is this helping you study? (1–5)", asked once by the study partner after the student's
// 10th question. "Not now" hides it until the next visit; an answer is saved and it never returns.
import { useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import type { PartnerId } from "@/lib/partners";

export function PulseCard({ partner, name, onDone, onLater }: { partner: PartnerId; name: string | null; onDone(): void; onLater(): void }) {
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const pick = async (n: number) => {
    setScore(n);
    setError(false);
    try {
      const r = await fetch("/api/pulse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ score: n }) });
      if (!r.ok) throw new Error();
      setTimeout(onDone, 1400);
    } catch {
      setScore(null);
      setError(true);
    }
  };

  return (
    <div className="pop-in mt-8 flex gap-3" role="group" aria-label="Is this helping you study?">
      <Mascot partner={partner} size={28} animated={false} className="mt-0.5 hidden sm:block" />
      <div className="rounded-[22px] bg-sunken/70 px-5 py-4">
        {score ? (
          <p className="text-[15px] text-ink">Thank you{name ? `, ${name}` : ""}! That really helps.</p>
        ) : (
          <>
            <p className="text-[15px] text-ink">Quick one{name ? `, ${name}` : ""}: is this helping you study?</p>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="mr-1 text-xs text-muted">Not really</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(n)}
                  aria-label={`${n} out of 5`}
                  className="grid h-9 w-9 place-items-center rounded-full bg-page text-sm text-ink transition hover:bg-pau-100 hover:text-brand active:scale-90"
                >
                  {n}
                </button>
              ))}
              <span className="ml-1 text-xs text-muted">A lot</span>
            </div>
            <button type="button" onClick={onLater} className="mt-3 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
              Not now
            </button>
            {error && <p role="alert" className="mt-2 text-xs text-red-700">Couldn&apos;t save. Try again.</p>}
          </>
        )}
      </div>
    </div>
  );
}
