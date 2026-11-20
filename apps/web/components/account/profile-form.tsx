"use client";

// Your profile: everything the student told us at sign-up, editable in one place, saved together.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { ProgrammePicker, type ProgrammeValue } from "@/components/onboarding/programme-picker";
import { PARTNER_IDS, PARTNERS, type PartnerId } from "@/lib/partners";
import type { ProgrammeChoice } from "@/lib/programmes";
import { PageFrame } from "./page-frame";
import type { ShellData } from "@/lib/nav/shell-data";

export function ProfileForm({
  email,
  choices,
  initial,
  shell,
}: {
  email: string;
  shell: ShellData;
  choices: ProgrammeChoice[];
  initial: { name: string; programme: string; level: number | null; partner: PartnerId };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [studying, setStudying] = useState<ProgrammeValue>({ programme: initial.programme, level: initial.level });
  const [partner, setPartner] = useState<PartnerId>(initial.partner);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const changed =
    name.trim() !== initial.name || studying.programme !== initial.programme || studying.level !== initial.level || partner !== initial.partner;

  async function save() {
    if (!changed || busy || !studying.programme || !studying.level) return;
    setBusy(true);
    setNote(null);
    const body: Record<string, unknown> = { display_name: name.trim() || null, study_partner: partner };
    if (studying.programme !== initial.programme || studying.level !== initial.level) Object.assign(body, { programme: studying.programme, level: studying.level });
    try {
      const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save. Try again.");
      setNote({ ok: true, text: "Saved." });
      router.refresh();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-sm font-medium text-ink";
  const field = "mt-1.5 w-full rounded-xl border border-line-strong bg-white px-4 py-3 text-[15px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-pau-200";
  return (
    <PageFrame title="Your profile">
      <div className="mt-6 space-y-6 rounded-[22px] bg-card p-6 ring-1 ring-line">
        <label className={label}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" className={field} />
        </label>
        <div>
          <p className={label}>Email</p>
          <p className="mt-1.5 rounded-xl bg-sunken px-4 py-3 text-[15px] text-muted">{email}</p>
        </div>
        <div>
          <p className={label}>What you study</p>
          <div className="mt-1.5">
            <ProgrammePicker choices={choices} value={studying} onChange={setStudying} />
          </div>
          <p className="mt-1.5 text-[13px] text-muted">Changing this changes the courses on My courses.</p>
        </div>
        <div>
          <p className={label}>Study partner</p>
          <div role="radiogroup" aria-label="Study partner" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PARTNER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={partner === id}
                onClick={() => setPartner(id)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl bg-white px-2 py-3 transition ${partner === id ? `ring-[3px] ${PARTNERS[id].accent.ring}` : "ring-1 ring-line hover:ring-line-strong"}`}
              >
                <Mascot partner={id} size={56} animated={false} mood={partner === id ? "happy" : "idle"} />
                <span className="text-[14px] font-medium text-ink">{PARTNERS[id].name}</span>
                <span className="text-center text-[12px] leading-tight text-muted">{PARTNERS[id].bestFor}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={!changed || busy || !studying.programme || !studying.level}
          className="rounded-full bg-brand px-6 py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        {note && <p className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-700"}`}>{note.text}</p>}
      </div>
    </PageFrame>
  );
}
