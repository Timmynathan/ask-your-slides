// The onboarding "← Back" pill (owner, 22 Nov 2026), the same on every step that can go back.
import { ArrowLeft } from "lucide-react";

export function BackPill({ onClick }: { onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-[14px] text-brand ring-1 ring-line transition hover:bg-sunken">
      <ArrowLeft size={16} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
      Back
    </button>
  );
}
