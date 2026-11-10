"use client";

// Landing: what you can do, as a deck of cards (layout and interaction modelled on a reference site;
// the words, previews, drawings and colours are ours). A pill row of tabs on top; the front card
// has the copy on the left and a small live preview on the right; the others fan out behind it.
// Drag the front card away (mouse or finger) to bring the next one forward, or pick a tab.
// Keyboard: the tabs are a tablist (arrow keys). Reduced motion: no flying, cards just swap.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { PARTNERS, PARTNER_IDS } from "@/lib/partners";
import { BEYOND_BOX, BeyondSlidesLabel } from "@/components/study/beyond-slides";
import { BooksDoodle } from "./doodles";

interface Card {
  tab: string;
  eyebrow: string;
  title: string;
  body: string;
  tint: string; // card colour
  inner: string; // preview panel colour
  preview: ReactNode;
}

const chip = "inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-[#0e1664] ring-1 ring-[#0e1664]/10";
const bubble = "rounded-2xl bg-[#eef2f8] px-3.5 py-2.5 text-[14px] text-[#191919]";

const CARDS: Card[] = [
  {
    tab: "Ask",
    eyebrow: "Ask your slides",
    title: "Answers straight from your slides",
    body: "Ask anything about a course. Every point comes with the exact slide it's from, one tap to open it.",
    tint: "bg-[#dfe8fb]",
    inner: "bg-[#eef3fd]",
    preview: (
      <PreviewCard>
        <p className={`${bubble} ml-auto max-w-[85%]`}>What is a B+ tree index?</p>
        <div className="mt-3 flex gap-2.5">
          <Mascot partner="ada" size={28} animated={false} title="" />
          <p className="text-[14px] leading-relaxed text-[#191919]">
            A B+ tree index keeps keys sorted, so a lookup takes O(log n) steps instead of scanning every row.{" "}
            <span className={chip}>Transactions and Indexing · Slide 21</span>
          </p>
        </div>
      </PreviewCard>
    ),
  },
  {
    tab: "Summaries",
    eyebrow: "Summaries",
    title: "A whole lecture, in the order it was taught",
    body: "Summarise a lecture, a topic or the whole course. It reads every slide, not just the first few, and cites them all.",
    tint: "bg-[#ddf1e4]",
    inner: "bg-[#eef8f1]",
    preview: (
      <PreviewCard>
        <p className={`${bubble} ml-auto max-w-[85%]`}>Summarise the lecture on project risk</p>
        <ol className="mt-3 space-y-2 text-[13.5px] text-[#191919]">
          {[
            ["Identify risks early", "Slide 3"],
            ["Rate likelihood and impact", "Slide 7"],
            ["Plan a response for each", "Slide 12"],
            ["Monitor and update the register", "Slide 18"],
          ].map(([t, s], i) => (
            <li key={t} className="flex items-baseline gap-2">
              <span className="font-semibold text-[#0e1664]">{i + 1}.</span>
              <span className="flex-1">{t}</span>
              <span className={chip}>{s}</span>
            </li>
          ))}
        </ol>
      </PreviewCard>
    ),
  },
  {
    tab: "Quiz me",
    eyebrow: "Quiz me",
    title: "Practice that marks you",
    body: "One question at a time, from your slides. Answer, get marked, and see the slide with the right answer.",
    tint: "bg-[#fbe6d6]",
    inner: "bg-[#fdf2ea]",
    preview: (
      <PreviewCard>
        <p className="text-[14px] font-medium text-[#191919]">Under contextual integrity, privacy means…</p>
        <div className="mt-3 space-y-2 text-[13.5px]">
          {[
            ["A", "Keeping all data secret", false],
            ["B", "Information flows that fit the context it was shared in", true],
            ["C", "Deleting data after use", false],
          ].map(([l, t, ok]) => (
            <p key={l as string} className={`rounded-xl px-3 py-2 ring-1 ${ok ? "bg-emerald-50 text-emerald-900 ring-emerald-300" : "bg-white/70 text-[#191919] ring-black/5"}`}>
              <span className="mr-1.5 font-semibold">{l}.</span>
              {t}
              {ok && <span className="ml-1.5">✓</span>}
            </p>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-[#5f6673]">
          Correct. <span className={chip}>Privacy · Slide 9</span>
        </p>
      </PreviewCard>
    ),
  },
  {
    tab: "Explain again",
    eyebrow: "Still confused?",
    title: "Explained again, in plain words",
    body: "Say “I still don't understand” and your study partner explains it another way, clearly marked as beyond your slides.",
    tint: "bg-[#ece4fb]",
    inner: "bg-[#f5f0fd]",
    preview: (
      <PreviewCard>
        <p className={`${bubble} ml-auto max-w-[85%]`}>I still don&apos;t understand</p>
        <div className={`mt-3 text-[13.5px] ${BEYOND_BOX}`}>
          <BeyondSlidesLabel name="Ada" className="text-[11.5px]" />
          <p className="text-[#191919]">
            Think of a library. You don&apos;t check every shelf for one book: you follow the signs to the right shelf. An index is
            those signs for a table.
          </p>
        </div>
      </PreviewCard>
    ),
  },
  {
    tab: "Study partners",
    eyebrow: "Study partners",
    title: "Four ways to explain the same slide",
    body: "Quick and memorable, deep understanding, exam technique, or a bit of everything. Switch partner any time.",
    tint: "bg-[#fbf0c9]",
    inner: "bg-[#fdf7e2]",
    preview: (
      <PreviewCard>
        <div className="grid grid-cols-2 gap-2.5">
          {PARTNER_IDS.map((id) => (
            <div key={id} className="flex items-center gap-2 rounded-xl bg-white/70 p-2 ring-1 ring-black/5">
              <Mascot partner={id} size={34} animated={false} title="" />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-[#191919]">{PARTNERS[id].name}</span>
                <span className="block truncate text-[11.5px] text-[#5f6673]">Best for: {PARTNERS[id].bestFor.toLowerCase()}</span>
              </span>
            </div>
          ))}
        </div>
      </PreviewCard>
    ),
  },
  {
    tab: "Slide viewer",
    eyebrow: "See the slide",
    title: "The slide behind every answer",
    body: "Tap a citation and the real slide opens beside the chat. Flip through the deck, or ask about that slide.",
    tint: "bg-[#d8eef3]",
    inner: "bg-[#ecf7f9]",
    preview: (
      <PreviewCard>
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/10">
          <div className="bg-[#0b1b4d] px-3 py-2 text-center text-[13px] font-bold text-white">Indexing: Why Are Indexes So Popular?</div>
          <div className="space-y-1.5 px-3 py-2.5 text-[12.5px] leading-snug text-[#0b1b4d]">
            <p>▪ Without an index, the DBMS must scan every row.</p>
            <p>
              ▪ <span className="rounded-sm bg-[#fde68a]">A B+ tree index keeps keys sorted.</span>
            </p>
            <p>▪ Leaves are linked, so range queries walk them in order.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[12px] text-[#5f6673]">
          <span>‹</span>
          <span>Slide 21 of 31</span>
          <span>›</span>
        </div>
      </PreviewCard>
    ),
  },
];

function PreviewCard({ children }: { children: ReactNode }) {
  return <div className="w-full rounded-2xl bg-white/95 p-4 shadow-[0_10px_30px_-12px_rgb(14_22_100/0.25)] ring-1 ring-black/5">{children}</div>;
}

const FLY_MS = 280;
const THRESHOLD = 110; // px of drag that sends the front card to the back

export function FeatureDeck() {
  // order[0] is the front card; the rest fan out behind it in this order.
  const [order, setOrder] = useState(() => CARDS.map((_, i) => i));
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState<number | null>(null); // direction the front card is leaving in
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const reduced = useRef(false);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const front = order[0];
  // Keep the chosen tab in view in the scrolling tab row (phones), once the visitor has interacted.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) return;
    const tab = document.getElementById(`deck-tab-${front}`);
    const row = tab?.closest("[data-tab-row]") as HTMLElement | null;
    if (tab && row) row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [front]);
  // A tab brings its card to the front and the deck follows the tab order from there, so the next
  // drag shows the next tab.
  const bringToFront = useCallback((i: number) => {
    touched.current = true;
    setOrder(CARDS.map((_, k) => (i + k) % CARDS.length));
  }, []);
  const sendFrontToBack = useCallback((dir: number) => {
    touched.current = true;
    if (reduced.current) {
      setOrder((o) => [...o.slice(1), o[0]]);
      return;
    }
    setFlying(dir);
    setTimeout(() => {
      setOrder((o) => [...o.slice(1), o[0]]);
      setFlying(null);
    }, FLY_MS);
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a,button")) return; // links and buttons still work
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0 });
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.3 });
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dx = e.clientX - start.current.x;
    start.current = null;
    setDrag(null);
    if (Math.abs(dx) > THRESHOLD) sendFrontToBack(Math.sign(dx));
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + CARDS.length) % CARDS.length;
    bringToFront(next);
    document.getElementById(`deck-tab-${next}`)?.focus();
  }

  return (
    <div>
      {/* Tabs */}
      <div data-tab-row className="mx-auto max-w-4xl overflow-x-auto px-1 [scrollbar-width:none]">
        <div role="tablist" aria-label="What you can do" className="mx-auto flex w-max min-w-full gap-1 rounded-full border border-line bg-card p-1">
          {CARDS.map((c, i) => (
            <button
              key={c.tab}
              id={`deck-tab-${i}`}
              role="tab"
              type="button"
              aria-selected={front === i}
              aria-controls="deck-card"
              tabIndex={front === i ? 0 : -1}
              onClick={() => bringToFront(i)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`flex-1 whitespace-nowrap rounded-full px-4 py-2.5 text-[14.5px] transition-colors sm:px-6 ${front === i ? "bg-sunken font-medium text-ink" : "text-ink/75 hover:text-ink"}`}
            >
              {c.tab}
            </button>
          ))}
        </div>
      </div>

      {/* Deck */}
      <div className="relative mx-auto mt-10 max-w-5xl">
        <BooksDoodle className="pointer-events-none absolute -bottom-6 -left-24 hidden w-40 xl:block" />
        <div className="relative mx-auto h-[640px] w-full max-w-[880px] sm:h-[560px] md:h-[440px]">
          {order
            .map((cardIndex, depth) => ({ cardIndex, depth }))
            .reverse() // paint the back first
            .map(({ cardIndex, depth }) => {
              const c = CARDS[cardIndex];
              const isFront = depth === 0;
              const visible = Math.min(depth, 4);
              const step = narrow ? 8 : 34; // phones: a tighter fan, so the cards stay on screen
              let transform = `translate(${visible * step}px, ${visible * (narrow ? 10 : 14)}px) rotate(${visible * (narrow ? 1.2 : 2.2)}deg) scale(${1 - visible * 0.035})`;
              if (isFront && drag) transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 28}deg)`;
              if (isFront && flying !== null) transform = `translate(${flying * 900}px, 40px) rotate(${flying * 18}deg)`;
              return (
                <div
                  key={c.tab}
                  id={isFront ? "deck-card" : undefined}
                  role={isFront ? "tabpanel" : undefined}
                  aria-labelledby={isFront ? `deck-tab-${cardIndex}` : undefined}
                  aria-hidden={!isFront}
                  onPointerDown={isFront ? onPointerDown : undefined}
                  onPointerMove={isFront ? onPointerMove : undefined}
                  onPointerUp={isFront ? onPointerUp : undefined}
                  onPointerCancel={isFront ? onPointerUp : undefined}
                  className={`absolute inset-0 flex select-none flex-col gap-5 rounded-[28px] p-6 shadow-[0_24px_60px_-28px_rgb(14_22_100/0.35)] ring-1 ring-black/5 md:flex-row md:p-8 ${c.tint} ${isFront ? "cursor-grab touch-pan-y active:cursor-grabbing" : "pointer-events-none"} ${depth > 4 ? "opacity-0" : ""}`}
                  style={{
                    transform,
                    zIndex: CARDS.length - depth,
                    transition: isFront && drag ? "none" : `transform ${flying !== null && isFront ? FLY_MS : 420}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 300ms`,
                  }}
                >
                  {/* Cards behind show only a hint of their content (none on phones), like a real stack. */}
                  <div className={`flex flex-col transition-opacity duration-300 md:w-[44%] md:py-2 ${isFront ? "" : "opacity-0 md:opacity-30"}`}>
                    <p className="font-heading text-[16px] italic text-ink/80">{c.eyebrow}</p>
                    <h3 className="mt-2 font-heading text-[30px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[36px]">{c.title}</h3>
                    <p className="mt-4 text-[15px] leading-relaxed text-ink/70">{c.body}</p>
                    <div className="mt-6 flex flex-wrap gap-3 md:mt-auto">
                      <Link href="/sign-up" tabIndex={isFront ? 0 : -1} className="rounded-full bg-navy px-5 py-2.5 text-[14.5px] font-medium text-white transition hover:opacity-90">
                        Try for free
                      </Link>
                      <a href="#demo" tabIndex={isFront ? 0 : -1} className="rounded-full px-5 py-2.5 text-[14.5px] font-medium text-ink ring-1 ring-ink/70 transition hover:bg-white/40">
                        See it in action
                      </a>
                    </div>
                  </div>
                  <div className={`flex min-h-0 flex-1 items-center justify-center rounded-2xl p-4 transition-opacity duration-300 md:p-6 ${c.inner} ${isFront ? "" : "opacity-0 md:opacity-30"}`}>{c.preview}</div>
                </div>
              );
            })}
        </div>
        <p className="mt-10 text-center text-[13px] text-muted">
          Drag a card to see the next one, or pick a tab.
        </p>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
      </div>
    </div>
  );
}
