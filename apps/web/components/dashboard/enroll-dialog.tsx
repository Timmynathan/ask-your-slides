"use client";

// "Add a course" (owner, 18 Nov 2026): for students retaking a course or taking an extra one. Lists
// the courses of the student's own programme at other levels (highest level first), with a search.
// Adding or removing re-reads My courses from the server; the dialog stays open to add several.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

interface Offered {
  id: string;
  /** "CSC 302", or null for a placeholder code (title only). */
  code: string | null;
  title: string;
  level: number;
  enrolled: boolean;
}

export function EnrollDialog({ onClose }: { onClose(): void }) {
  const router = useRouter();
  const [courses, setCourses] = useState<Offered[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/enrollments")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { courses: Offered[] }) => live && setCourses(d.courses))
      .catch(() => live && setError("Couldn't load the courses. Try again."));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    const shown = (courses ?? []).filter((c) => !q || (c.title + (c.code ?? "")).toLowerCase().replace(/\s+/g, "").includes(q));
    const levels = [...new Set(shown.map((c) => c.level))].sort((a, b) => b - a);
    return levels.map((level) => ({ level, items: shown.filter((c) => c.level === level) }));
  }, [courses, query]);

  async function toggle(c: Offered) {
    if (busy) return;
    setBusy(c.id);
    setError(null);
    try {
      const r = await fetch("/api/enrollments", { method: c.enrolled ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course: c.id }) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Couldn't save. Try again.");
      setCourses((list) => list?.map((x) => (x.id === c.id ? { ...x, enrolled: !c.enrolled } : x)) ?? null);
      router.refresh(); // My courses re-reads its list from the server
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enroll-title"
        onClick={(e) => e.stopPropagation()}
        className="pop-in flex max-h-[min(640px,85dvh)] w-full max-w-lg flex-col rounded-[28px] bg-page p-6 text-left shadow-xl ring-1 ring-line"
      >
        <h2 id="enroll-title" className="text-[20px] text-ink">Add a course</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">Retaking a course or taking an extra one? Add it from any level of your programme.</p>
        <label className="relative mt-5 block">
          <span className="sr-only">Search courses</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m13 13 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by course code or title"
            className="h-11 w-full rounded-full border border-line bg-card pl-10 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
        </label>

        <div className="-mx-2 mt-4 min-h-0 flex-1 overflow-y-auto px-2">
          {!courses && !error && <div className="h-40 animate-pulse rounded-2xl bg-sunken" />}
          {courses && courses.length === 0 && <p className="py-8 text-center text-[15px] text-muted">No other levels of your programme are available yet.</p>}
          {courses && courses.length > 0 && groups.length === 0 && <p className="py-8 text-center text-[15px] text-muted">No courses match “{query.trim()}”.</p>}
          {groups.map((g) => (
            <section key={g.level} className="mb-4 last:mb-0">
              <h3 className="mb-1.5 text-[13px] font-medium text-muted">{g.level} level</h3>
              <ul className="overflow-hidden rounded-2xl ring-1 ring-line">
                {g.items.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink" title={c.title}>{c.title}</span>
                      <span className="block text-[13px] text-muted">
                        {[c.code, c.enrolled ? "In My courses" : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      disabled={busy === c.id}
                      aria-label={c.enrolled ? `Remove ${c.code ?? c.title}` : `Add ${c.code ?? c.title}`}
                      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-50 ${
                        c.enrolled ? "text-ink ring-1 ring-line-strong hover:bg-sunken" : "bg-brand text-brand-ink hover:opacity-90"
                      }`}
                    >
                      {busy === c.id ? "…" : c.enrolled ? "Remove" : "Add"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2.5 text-sm font-medium text-ink ring-1 ring-line-strong hover:bg-sunken">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
