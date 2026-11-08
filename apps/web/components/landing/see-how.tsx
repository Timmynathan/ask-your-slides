"use client";

// "See how it works": fills the screen with the chat demo and starts it at once, so the
// visitor sees it from the first keystroke. Without JS it is a plain link to #demo.
export const DEMO_PLAY_EVENT = "ays:demo-play";

function go(e: React.MouseEvent<HTMLAnchorElement>) {
  const demo = document.getElementById("demo");
  if (!demo) return;
  e.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  demo.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  window.dispatchEvent(new Event(DEMO_PLAY_EVENT));
}

export function SeeHowItWorks() {
  return (
    <a
      href="#demo"
      onClick={go}
      className="cue-ring group mt-5 inline-flex items-center gap-2.5 rounded-full bg-pau-50 py-1.5 pl-1.5 pr-5 text-[15px] font-semibold text-brand ring-1 ring-brand/15 transition hover:bg-pau-100 active:scale-[0.97]"
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-brand-ink transition group-hover:scale-110">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 1.8v8.4L10 6z" fill="currentColor" />
        </svg>
      </span>
      See how it works
    </a>
  );
}

export function ScrollCue() {
  return (
    <a
      href="#demo"
      onClick={go}
      aria-label="Scroll to see how it works"
      className="scroll-cue absolute bottom-5 left-1/2 hidden -translate-x-1/2 rounded-full p-2 text-muted hover:text-ink sm:block"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M5 8l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
