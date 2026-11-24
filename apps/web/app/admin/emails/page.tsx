import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { EmailControls } from "@/components/admin/email-controls";
import { isAdminEmail } from "@/lib/admin";
import { requireUser } from "@/lib/auth/session";
import { DAILY_UPDATE_CAP, lagosDayStart, WEEKLY_PER_USER } from "@/lib/email/queue";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Emails · Admin · Ask Your Slides", robots: { index: false, follow: false } };

// Owner-only. The update-email queue, how many of each email went out, unsubscribes, buttons to queue
// "past questions live" / "new slides" for a course, previews, and test sends to yourself.
const TYPES = [
  { id: "signin", label: "Sign-in code" },
  { id: "welcome", label: "Welcome" },
  { id: "pastq", label: "Past questions live" },
  { id: "newslides", label: "New slides" },
  { id: "test", label: "Tests to me" },
] as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

async function Loaded() {
  const { user } = await requireUser();
  if (!isAdminEmail(user.email)) notFound();
  const db = adminClient();
  const now = new Date();
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const today = lagosDayStart(now);
  const [queue, sends, unsub, courses, pending] = await Promise.all([
    db.from("email_queue").select("id, type, status, reason, created_at, sent_at, profiles(email), courses(code, title)").order("created_at", { ascending: false }).limit(100),
    db.from("email_sends").select("type, sent_at").limit(20000),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("email_updates", false),
    db.from("courses").select("id, code, title, programme").order("programme").order("sort_order"),
    db.from("email_queue").select("id", { count: "exact", head: true }).eq("status", "queued"),
  ]);
  if (queue.error) {
    return (
      <Shell>
        <p className="rounded-2xl bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-200">
          The email tables aren&apos;t in the database yet. Run <code>npm run db:push</code> (migration 20261124000001_emails.sql), then reload.
        </p>
      </Shell>
    );
  }
  const rows = (sends.data ?? []) as { type: string; sent_at: string }[];
  const count = (type: string, since?: string) => rows.filter((r) => r.type === type && (!since || r.sent_at >= since)).length;
  const updatesToday = rows.filter((r) => ["welcome", "pastq", "newslides"].includes(r.type) && r.sent_at >= today).length;
  type QRow = { id: string; type: string; status: string; reason: string | null; created_at: string; sent_at: string | null; profiles: { email: string } | null; courses: { code: string; title: string } | null };

  return (
    <Shell>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Waiting in the queue" value={pending.count ?? 0} />
        <Stat label="Update emails sent today" value={`${updatesToday} / ${DAILY_UPDATE_CAP}`} />
        <Stat label="Unsubscribed students" value={unsub.count ?? 0} />
        <Stat label="Limit per student" value={`${WEEKLY_PER_USER} a week`} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-medium">Sent</h2>
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-tint text-muted">
              <tr><th className="px-4 py-2 font-normal">Email</th><th className="px-4 py-2 font-normal">Last 7 days</th><th className="px-4 py-2 font-normal">All time</th></tr>
            </thead>
            <tbody>
              {TYPES.map((t) => (
                <tr key={t.id} className="border-t border-line"><td className="px-4 py-2">{t.label}</td><td className="px-4 py-2 tabular-nums">{count(t.id, week)}</td><td className="px-4 py-2 tabular-nums">{count(t.id)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <EmailControls courses={(courses.data ?? []) as { id: string; code: string; title: string; programme: string }[]} />

      <section className="mt-10">
        <h2 className="text-lg font-medium">Queue (latest 100)</h2>
        {(queue.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing queued yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-line">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-tint text-muted">
                <tr>{["Added", "Student", "Email", "Course", "Status"].map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(queue.data as unknown as QRow[]).map((q) => (
                  <tr key={q.id} className="border-t border-line align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-muted">{when(q.created_at)}</td>
                    <td className="px-4 py-2">{q.profiles?.email ?? "—"}</td>
                    <td className="px-4 py-2">{TYPES.find((t) => t.id === q.type)?.label ?? q.type}</td>
                    <td className="px-4 py-2">{q.courses ? `${q.courses.code} ${q.courses.title}` : "—"}</td>
                    <td className="px-4 py-2">{q.status}{q.sent_at ? ` · ${when(q.sent_at)}` : ""}{q.reason ? <span className="block text-xs text-muted">{q.reason}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" aria-label="Admin dashboard"><Logo size={24} /></Link>
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-ink">Admin</span>
          <Link href="/admin/payments" className="ml-auto rounded-full px-3 py-1.5 text-sm text-muted hover:bg-sunken hover:text-ink">Payments</Link>
          <Link href="/admin" className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-sunken hover:text-ink">Dashboard</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="text-[28px] tracking-tight">Emails</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Update emails go out every hour from the queue: students on Finals first, then the most recently active. Sign-in codes are not limited.</p>
        {children}
      </main>
    </div>
  );
}

export default function AdminEmailsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
