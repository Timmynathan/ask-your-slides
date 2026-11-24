"use client";

// /admin/emails buttons: queue "past questions live" or "new slides" for a course, send each email to
// yourself as a test, run the queue now, and open the previews.
import { useRouter } from "next/navigation";
import { useState } from "react";

type Course = { id: string; code: string; title: string; programme: string };
const TESTS = [
  { type: "signin", label: "Sign-in code" },
  { type: "welcome", label: "Welcome" },
  { type: "pastq", label: "Past questions live" },
  { type: "newslides", label: "New slides" },
] as const;
const btn = "rounded-full px-4 py-2 text-sm ring-1 ring-line-strong hover:bg-sunken disabled:opacity-50";

export function EmailControls({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function call(body: Record<string, unknown>, done: (r: Record<string, unknown>) => string) {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const r = ((await res?.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    setBusy(false);
    setNote(res?.ok ? done(r) : String(r.error ?? "That didn't work."));
    router.refresh();
  }

  return (
    <section className="mt-10 space-y-8">
      <div>
        <h2 className="text-lg font-medium">Email a course&apos;s students</h2>
        <p className="mt-1 text-sm text-muted">Queues the email for everyone who has used the course (past questions: also everyone in its programme and level). It goes out with the next hourly run.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="max-w-full rounded-full bg-card px-4 py-2 text-sm ring-1 ring-line-strong">
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.programme} · {c.code} {c.title}</option>
            ))}
          </select>
          <button className={btn} disabled={busy || !courseId} onClick={() => call({ action: "enqueue", type: "pastq", courseId }, (r) => `Queued "past questions live" for ${r.queued} students.`)}>
            Past questions live
          </button>
          <button className={btn} disabled={busy || !courseId} onClick={() => call({ action: "enqueue", type: "newslides", courseId }, (r) => `Queued "new slides" for ${r.queued} students.`)}>
            New slides
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium">Send a test to me</h2>
        <p className="mt-1 text-sm text-muted">Goes to your own email now, marked [Test]. Course emails use the course picked above.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TESTS.map((t) => (
            <button key={t.type} className={btn} disabled={busy} onClick={() => call({ action: "test", type: t.type, courseId }, (r) => `Sent "${t.label}" to ${r.to}.`)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium">Preview</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TESTS.map((t) => (
            <a key={t.type} href={`/admin/emails/preview?type=${t.type}${t.type === "pastq" || t.type === "newslides" ? `&course=${courseId}` : ""}`} target="_blank" rel="noreferrer" className={btn}>
              {t.label}
            </a>
          ))}
          <button className={btn} disabled={busy} onClick={() => call({ action: "run" }, (r) => `Queue run: ${r.sent} sent, ${r.skipped} skipped, ${r.waiting} waiting, ${r.failed} failed.`)}>
            Run the queue now
          </button>
        </div>
      </div>
      {note && <p role="status" className="rounded-2xl bg-sunken px-4 py-3 text-sm">{note}</p>}
    </section>
  );
}
