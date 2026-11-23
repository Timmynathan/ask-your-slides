"use client";

// "Was this helpful?" under an answer (owner, 23 Nov 2026: 2 ratings in 180 answers, so the quiet
// thumbs alone tell us almost nothing). Asked from the student's 3rd answer of the day, on at most
// MAX_ASKS answers a day, and never again that day once they rate one. Never on an answer that ends
// with a question (a quiz or check question is waiting for their reply). Counted per device, by
// Lagos day; storage failures just mean no ask.
import { useCallback, useEffect, useState } from "react";

const KEY = "ays-helpful-ask";
const FROM_ANSWER = 3;
const MAX_ASKS = 3;

type Day = { date: string; counted: string[]; asked: string[]; done: boolean };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

function read(): Day {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as Day | null;
    if (d && d.date === today()) return d;
  } catch {}
  return { date: today(), counted: [], asked: [], done: false };
}

function write(d: Day) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, counted: d.counted.slice(-50) }));
  } catch {}
}

/** `answerId`: the latest finished answer (null while one is streaming). `eligible`: it can be asked
 *  about (not rated yet, doesn't end with a question). Returns the answer to ask about, if any. */
export function useHelpfulAsk(answerId: string | null, eligible: boolean) {
  const [askId, setAskId] = useState<string | null>(null);
  useEffect(() => {
    if (!answerId) return;
    const t = setTimeout(() => {
      const d = read();
      if (!d.counted.includes(answerId)) d.counted.push(answerId);
      const ask = eligible && !d.done && (d.asked.includes(answerId) || (d.counted.length >= FROM_ANSWER && d.asked.length < MAX_ASKS));
      if (ask && !d.asked.includes(answerId)) d.asked.push(answerId);
      write(d);
      setAskId(ask ? answerId : null);
    }, 0);
    return () => clearTimeout(t);
  }, [answerId, eligible]);
  const done = useCallback(() => {
    write({ ...read(), done: true });
    setAskId(null);
  }, []);
  return { askId, done };
}
