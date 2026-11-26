"use client";

// Shows "You're on Finals" the moment an admin approves the payment (owner, 26 Nov 2026: students
// otherwise saw it only after opening another page). While the student is on Free and the tab is
// visible, asks /api/plans/status every 30 s (and at once when the tab comes back); when the plan turns
// to Finals it opens the pop-up and refreshes the page (the Upgrade button, limits, the pay screen).
// Stops asking once they're on Finals. FinalsWelcome itself makes sure the pop-up shows only once.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FINALS_DAILY } from "@/lib/plans/config";
import { FinalsWelcome } from "./finals-welcome";

const EVERY_MS = 30_000;
type Welcome = { id: string; endsAt: string; trial: boolean };

export function FinalsWatcher() {
  const router = useRouter();
  const [welcome, setWelcome] = useState<Welcome | null>(null);

  useEffect(() => {
    let wasFree: boolean | null = null; // unknown until the first answer
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/plans/status", { cache: "no-store" });
        if (!res.ok) return;
        const s = (await res.json()) as { plan: string; welcome: Welcome | null };
        if (s.plan === "free") {
          wasFree = true;
          return;
        }
        // Already on Finals when the page opened: the pages show the pop-up themselves.
        if (wasFree && s.welcome) {
          setWelcome(s.welcome);
          router.refresh();
        }
        stop();
      } catch {
        // Offline for a moment: try again on the next tick.
      }
    }
    check();
    timer = setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return stop;
  }, [router]);

  return welcome ? <FinalsWelcome id={welcome.id} endsAt={welcome.endsAt} daily={FINALS_DAILY} trial={welcome.trial} /> : null;
}
