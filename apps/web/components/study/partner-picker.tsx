"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { Spinner } from "@/components/ui/spinner";
import { PARTNERS, PARTNER_IDS, type PartnerId } from "@/lib/partners";

/** "Change study partner" dialog. Saves at once; the new partner takes over from the next message. */
export function PartnerPicker({ current, onClose, onChanged }: { current: PartnerId; onClose(): void; onChanged(id: PartnerId): void }) {
  const [saving, setSaving] = useState<PartnerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function choose(id: PartnerId) {
    if (id === current) return onClose();
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(id);
    setError(null);
    try {
      const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ study_partner: id }) });
      if (!res.ok) throw new Error();
      onChanged(id);
    } catch {
      setError("Couldn't switch partner. Try again.");
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change study partner"
        className="pop-in w-full max-w-md rounded-[25px] bg-card p-6 shadow-2xl ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-2xl font-semibold text-ink">Change study partner</h2>
        <p className="mt-1 text-sm text-muted">Same slides, different way of explaining. Takes effect from your next question.</p>
        <div role="radiogroup" className="mt-5 space-y-2">
          {PARTNER_IDS.map((id) => {
            const p = PARTNERS[id];
            const selected = id === current;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={selected}
                onClick={() => choose(id)}
                disabled={!!saving}
                className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors hover:bg-sunken ${selected ? `ring-2 ${p.accent.ring} ${p.accent.soft}` : "ring-line"}`}
              >
                <Mascot partner={id} size={52} mood={selected ? "happy" : "idle"} />
                <span className="min-w-0 flex-1">
                  <span className="block font-heading text-lg font-semibold text-ink">{p.name}</span>
                  <span className="block text-sm text-muted">{p.tagline}</span>
                </span>
                {saving === id ? <Spinner /> : selected ? <span className="text-xs font-medium text-muted">Current</span> : null}
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button onClick={onClose} className="mt-5 w-full rounded-full px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-line hover:bg-sunken">
          Close
        </button>
      </div>
    </div>
  );
}
