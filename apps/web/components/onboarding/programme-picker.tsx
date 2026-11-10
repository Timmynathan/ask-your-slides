"use client";

// "What do you study?" (PRD F11): programme + level, only those in the catalog. Used at onboarding
// and in the account menu's "Change programme". With one level for the chosen programme, the level
// is picked for the student (still shown, so they can check it).
import { programmeFullName, programmeLabel, type ProgrammeChoice } from "@/lib/programmes";

export interface ProgrammeValue {
  programme: string;
  level: number | null;
}

const FIELD =
  "w-full appearance-none rounded-full border border-line-strong bg-card px-6 py-3.5 text-center text-lg outline-none focus:border-brand focus:ring-4 focus:ring-pau-200";

export function ProgrammePicker({ choices, value, onChange }: { choices: ProgrammeChoice[]; value: ProgrammeValue; onChange(v: ProgrammeValue): void }) {
  const chosen = choices.find((c) => c.programme === value.programme) ?? null;
  return (
    <div className="space-y-3">
      <Select
        label="What do you study?"
        value={value.programme}
        onChange={(programme) => {
          const levels = choices.find((c) => c.programme === programme)?.levels ?? [];
          onChange({ programme, level: levels.length === 1 ? levels[0] : null });
        }}
        placeholder="What do you study?"
        options={choices.map((c) => ({ value: c.programme, label: programmeLabel(c) }))}
      />
      {chosen && programmeFullName(chosen) && <p className="-mt-1 text-center text-[13px] text-muted">{programmeFullName(chosen)}</p>}
      {chosen && (
        <Select
          label="Level"
          value={value.level ? String(value.level) : ""}
          onChange={(v) => onChange({ programme: value.programme, level: Number(v) })}
          placeholder="Level"
          options={chosen.levels.map((l) => ({ value: String(l), label: `${l} level` }))}
        />
      )}
    </div>
  );
}

function Select({ label, value, onChange, placeholder, options }: { label: string; value: string; onChange(v: string): void; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required aria-label={label} className={`${FIELD} ${value ? "text-ink" : "text-muted/60"}`}>
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="m3 5 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
