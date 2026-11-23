"use client";

// When the recommend-us card shows (owner, 23 Nov 2026; components/feedback/nps-card.tsx; it replaced an
// inline "Was this helpful?"). After the student's 3rd finished answer of a day, never under an answer
// that is waiting for their reply (a quiz or check question). After "Not now" or the X it waits 3 days;
// after a score, 60 days. Counted per device by Lagos day; storage failures just mean no card.
import { useCallback, useEffect, useState } from "react";

const DAY_KEY = "ays-helpful-ask"; // answers seen today
const SNOOZE_KEY = "ays-nps-snooze"; // until when the card stays away
const FROM_ANSWER = 3;
const SNOOZE_DAYS = { dismissed: 3, answered: 60 };

type Day = { date: string; counted: string[] };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function readDay(): Day {
  try {
    const d = JSON.parse(localStorage.getItem(DAY_KEY) ?? "null") as Day | null;
    if (d && d.date === today()) return { date: d.date, counted: d.counted ?? [] };
  } catch {}
  return { date: today(), counted: [] };
}

function snoozed(): boolean {
  try {
    return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
  } catch {
    return true;
  }
}

/** `answerId`: the latest finished answer (null while one is streaming). `eligible`: the card may follow
 *  it (it doesn't end with a question). */
export function useNpsAsk(answerId: string | null, eligible: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!answerId) return;
    const t = setTimeout(() => {
      const d = readDay();
      if (!d.counted.includes(answerId)) d.counted.push(answerId);
      try {
        localStorage.setItem(DAY_KEY, JSON.stringify({ date: d.date, counted: d.counted.slice(-50) }));
      } catch {}
      // A moment after the answer finishes, so the student sees it first.
      if (eligible && d.counted.length >= FROM_ANSWER && !snoozed()) setShow(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [answerId, eligible]);
  const close = useCallback((answered: boolean) => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + (answered ? SNOOZE_DAYS.answered : SNOOZE_DAYS.dismissed) * 86_400_000));
    } catch {}
    setShow(false);
  }, []);
  return { show, close };
}
