"use client";

// Study partner switch (top bar of My courses and of every course). A pill with the partner's face,
// name and a swap icon, so it reads as a control, not decoration; the first time a student sees it,
// a small hint says what it does (remembered per browser). Opens the partner picker.
import { useSyncExternalStore } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { PARTNERS, type PartnerId } from "@/lib/partners";
import { PartnerPicker } from "./partner-picker";

const HINT_KEY = "ays-partner-hint-seen";
const HINT_EVENT = "ays-partner-hint";
// One shared "seen" flag: My courses and a course page can both be mounted (Next keeps the previous
// page), so dismissing the hint on one must hide it on the other.
function subscribe(onChange: () => void) {
  window.addEventListener(HINT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HINT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
// Remembered per account (its id) on this browser, so a new account still gets the hint once:
// a second student on a shared laptop, or the same email deleted and signed up again.
const keyFor = (account: string) => `${HINT_KEY}:${account.toLowerCase()}`;
function readSeen(account: string): boolean {
  try {
    return !!localStorage.getItem(keyFor(account));
  } catch {
    return true; // storage blocked: no hint; the labelled pill still says what it is
  }
}
function markSeen(account: string) {
  try {
    localStorage.setItem(keyFor(account), "1");
  } catch {}
  window.dispatchEvent(new Event(HINT_EVENT));
}

export function PartnerSwitch({ partner, onChanged, open, onOpenChange, account }: {
  partner: PartnerId;
  /** The signed-in account's id: the hint is shown once per account. */
  account: string;
  onChanged(id: PartnerId): void;
  /** Controlled from outside too (account menu → "Change study partner"). */
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const p = PARTNERS[partner];
  // Seen before? Read from this browser; the server (no storage) renders no hint.
  const seen = useSyncExternalStore(subscribe, () => readSeen(account), () => true);
  const hint = !seen;
  const dismissHint = () => markSeen(account);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          dismissHint();
          onOpenChange(true);
        }}
        aria-label={`Studying with ${p.name}. Change study partner`}
        title={`Studying with ${p.name} · change`}
        className="flex h-10 items-center gap-1.5 rounded-full bg-sunken py-1 pl-1 pr-2.5 text-[14px] text-ink transition hover:bg-pau-100 active:scale-95"
      >
        <Mascot key={partner} partner={partner} size={32} animated={false} className="pop-in" />
        <span className="hidden sm:inline">{p.name}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden>
          <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
        </svg>
      </button>
      {/* Clicks pass through the bubble (only "Got it" is clickable): it never blocks the page. */}
      {hint && !open && (
        <div role="status" className="pop-in pointer-events-none absolute right-0 top-12 z-30 w-60 rounded-2xl bg-navy p-3.5 text-left text-[13.5px] leading-snug text-white shadow-xl">
          <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 bg-navy" aria-hidden />
          Tap here to switch study partners any time: Tobi, Ada, Dr. Musa or Zara.
          <button type="button" onClick={dismissHint} className="pointer-events-auto mt-2 block rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-medium hover:bg-white/25">
            Got it
          </button>
        </div>
      )}
      {open && (
        <PartnerPicker
          current={partner}
          onClose={() => onOpenChange(false)}
          onChanged={(id) => {
            onChanged(id);
            onOpenChange(false);
          }}
        />
      )}
    </div>
  );
}
