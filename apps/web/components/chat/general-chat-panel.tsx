"use client";

// The general chat on the right of the dashboard (owner, 20 Nov 2026), wide screens only. The study
// partner greets the student with a typed line ("Hi Tolu, I'm Zara.") and then "How can I help?";
// the other partners pop up from behind; "Change character" opens the partner picker; suggestion
// chips fill the question box. Answering across all courses is step 3 of the owner's plan: until it's
// built, a question gets an honest reply pointing to the course chats.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { PARTNER_IDS, PARTNERS, type PartnerId } from "@/lib/partners";

const SUGGESTIONS = ["What should I revise first?", "Quiz me on my courses", "Explain a hard topic simply", "Summarise a lecture for me"];

/** Types `text` out, one character at a time, after `delay` ms. */
function useTyped(text: string, delay = 0, speed = 38) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    let tick: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      tick = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length && tick) clearInterval(tick);
      }, speed);
    }, delay);
    return () => {
      clearTimeout(start);
      if (tick) clearInterval(tick);
    };
  }, [text, delay, speed]);
  return text.slice(0, n);
}

export function GeneralChatPanel({ partner, firstName, onChangePartner }: { partner: PartnerId; firstName: string | null; onChangePartner(): void }) {
  const p = PARTNERS[partner];
  const hello = `Hi${firstName ? ` ${firstName}` : ""}, I'm ${p.name}.`;
  const typedHello = useTyped(hello, 500);
  const ask = "How can I help?";
  const typedAsk = useTyped(ask, 500 + hello.length * 38 + 350, 45);
  const others = PARTNER_IDS.filter((id) => id !== partner);

  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const box = useRef<HTMLTextAreaElement>(null);
  const send = (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q) return;
    setSent((s) => [...s, q]);
    setDraft("");
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-20 hidden w-[380px] flex-col border-l border-line bg-page xl:flex" aria-label="Chat with your study partner">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-10">
        {/* The partner, with the others peeking out from behind */}
        <div className="relative mx-auto h-[112px] w-[150px]">
          {others.map((id, i) => (
            <span
              key={id}
              className="peek-up absolute"
              style={{
                left: [8, 104, 92][i],
                top: [54, 52, 0][i],
                animationDelay: `${0.25 + i * 0.15}s`,
              }}
            >
              <Mascot partner={id} size={i === 2 ? 34 : 38} animated={false} />
            </span>
          ))}
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Mascot partner={partner} size={96} mood="happy" animated={false} />
          </span>
        </div>
        <div className="mt-2 flex justify-center">
          <button type="button" onClick={onChangePartner} className="rounded-full bg-sunken px-3 py-1 text-[12.5px] text-muted transition hover:text-ink active:scale-95">
            Change character
          </button>
        </div>

        <p className="mt-6 min-h-[1.5em] text-center text-[15px] text-muted" aria-live="polite">
          {typedHello}
        </p>
        <h2 className="mt-1 min-h-[1.4em] text-center font-heading text-[26px] text-ink">{typedAsk}</h2>

        {sent.length === 0 ? (
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setDraft(s);
                  box.current?.focus();
                }}
                className="rounded-full bg-card px-3.5 py-2 text-[13.5px] text-ink ring-1 ring-line transition hover:ring-brand active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-7 space-y-3">
            {sent.map((q, i) => (
              <div key={i} className="space-y-3">
                <p className="ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-md bg-brand px-4 py-2.5 text-[14.5px] text-brand-ink">{q}</p>
                <div className="flex items-start gap-2">
                  <Mascot partner={partner} size={28} animated={false} />
                  <p className="max-w-[85%] rounded-[18px] rounded-tl-md bg-sunken px-4 py-2.5 text-[14.5px] text-ink">
                    Asking across all your courses at once is almost ready. For now, open one of your courses and ask me there: I&apos;ll answer from its slides.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={send} className="m-4 rounded-[22px] bg-card p-2 ring-1 ring-line-strong focus-within:ring-brand">
        <textarea
          ref={box}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) send(e);
          }}
          rows={2}
          placeholder={`Ask ${p.name} anything about your courses…`}
          aria-label="Your question"
          className="w-full resize-none bg-transparent px-3 py-2 text-[15px] text-ink outline-none placeholder:text-muted"
        />
        <div className="flex justify-end">
          <button type="submit" disabled={!draft.trim()} aria-label="Send" className="grid h-9 w-9 place-items-center rounded-full bg-brand text-brand-ink transition hover:opacity-90 active:scale-90 disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
    </aside>
  );
}
