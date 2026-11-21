"use client";

// Under an answer that ran out of room (owner, 21 Nov 2026): says so plainly and continues from the
// exact slide it stopped at (lib/agent/run.ts reads the rest of the deck for "keep going").
export const CONTINUE_TEXT = "Keep going from where you stopped.";

export function CutShort({ onContinue, disabled = false }: { onContinue(): void; disabled?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-sunken/70 px-4 py-3">
      <p className="min-w-0 flex-1 text-[13.5px] text-muted">This answer was cut short.</p>
      <button
        type="button"
        onClick={onContinue}
        disabled={disabled}
        className="shrink-0 rounded-full bg-navy px-4 py-1.5 text-[13px] font-medium text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
}
