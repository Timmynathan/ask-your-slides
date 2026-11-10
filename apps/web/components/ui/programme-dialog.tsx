"use client";

// "Change programme" (account menu, PRD F11): the same choice as onboarding. Saving reloads My
// courses, which then lists the new programme's courses (the database decides what is visible).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ProgrammePicker, type ProgrammeValue } from "@/components/onboarding/programme-picker";
import type { ProgrammeChoice } from "@/lib/programmes";
import { BusyLabel } from "./spinner";

export function ProgrammeDialog({ onClose }: { onClose(): void }) {
  const router = useRouter();
  const [choices, setChoices] = useState<ProgrammeChoice[] | null>(null);
  const [value, setValue] = useState<ProgrammeValue>({ programme: "", level: null });
  const [initial, setInitial] = useState<ProgrammeValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;
    fetch("/api/programmes")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { choices: ProgrammeChoice[]; current: { programme: string | null; level: number | null } | null }) => {
        if (!live) return;
        setChoices(d.choices);
        const cur = { programme: d.current?.programme ?? "", level: d.current?.level ?? null };
        setValue(cur);
        setInitial(cur);
      })
      .catch(() => live && setError("Couldn't load the programmes. Try again."));
    return () => {
      live = false;
    };
  }, []);

  const changed = !!value.programme && !!value.level && (value.programme !== initial?.programme || value.level !== initial?.level);

  async function save() {
    if (!changed || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programme: value.programme, level: value.level }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Couldn't save. Try again.");
      onClose();
      router.push("/dashboard");
      router.refresh(); // new programme, new courses: re-read them from the server
    } catch (e) {
      setError((e as Error).message);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4" onClick={() => !inFlight.current && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change programme"
        onClick={(e) => e.stopPropagation()}
        className="pop-in w-full max-w-md rounded-[28px] bg-page p-6 text-left shadow-xl ring-1 ring-line"
      >
        <h2 className="text-[20px] text-ink">What do you study?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">Your courses come from your programme and level. Your chats in other courses are kept.</p>
        <div className="mt-5">{choices ? <ProgrammePicker choices={choices} value={value} onChange={setValue} /> : <div className="h-14 animate-pulse rounded-full bg-sunken" />}</div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2.5 text-sm text-ink hover:bg-sunken">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!changed || busy} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-ink hover:opacity-90 disabled:opacity-50">
            <BusyLabel busy={busy} label="Save" busyLabel="Saving…" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
