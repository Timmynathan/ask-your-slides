// The emails section of the admin dashboard (owner, 25 Nov 2026: "add the whole email page to the admin
// dashboard… so that I can easily view that and keep track of the emails that are being sent out").
// Server-rendered: counts by type, the latest emails sent (to whom, when), the queue, and the controls to
// queue or test an email. /admin/emails opens this tab.
import { EmailControls } from "@/components/admin/email-controls";
import { DAILY_UPDATE_CAP, lagosDayStart, WEEKLY_PER_USER } from "@/lib/email/queue";
import { adminClient } from "@/lib/supabase/admin";

const TYPES = [
  { id: "signin", label: "Sign-in code" },
  { id: "welcome", label: "Welcome" },
  { id: "pastq", label: "Past questions live" },
  { id: "newslides", label: "New slides" },
  { id: "test", label: "Tests to me" },
] as const;
const label = (type: string) => TYPES.find((t) => t.id === type)?.label ?? type;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

type QRow = { id: string; type: string; status: string; reason: string | null; created_at: string; sent_at: string | null; profiles: { email: string } | null; courses: { code: string; title: string } | null };
type SRow = { id: string; type: string; sent_at: string; profiles: { email: string } | null; courses: { code: string; title: string } | null };

export async function EmailsPanel() {
  const db = adminClient();
  const now = new Date();
  const week = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const today = lagosDayStart(now);
  const [queue, sends, recent, unsub, courses, pending] = await Promise.all([
    db.from("email_queue").select("id, type, status, reason, created_at, sent_at, profiles(email), courses(code, title)").order("created_at", { ascending: false }).limit(100),
    db.from("email_sends").select("type, sent_at").limit(20000),
    db.from("email_sends").select("id, type, sent_at, profiles(email), courses(code, title)").order("sent_at", { ascending: false }).limit(100),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("email_updates", false),
    db.from("courses").select("id, code, title, programme").order("programme").order("sort_order"),
    db.from("email_queue").select("id", { count: "exact", head: true }).eq("status", "queued"),
  ]);
  if (queue.error) {
    return (
      <p className="rounded-2xl bg-amber-50 p-5 text-amber-900 ring-1 ring-amber-200">
        The email tables aren&apos;t in the database yet. Run <code>npm run db:push</code> (migration 20261124000001_emails.sql), then reload.
      </p>
    );
  }
  const rows = (sends.data ?? []) as { type: string; sent_at: string }[];
  const count = (type: string, since?: string) => rows.filter((r) => r.type === type && (!since || r.sent_at >= since)).length;
  const sentToday = rows.filter((r) => r.sent_at >= today).length;
  const updatesToday = rows.filter((r) => ["welcome", "pastq", "newslides"].includes(r.type) && r.sent_at >= today).length;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-heading text-[24px] font-medium tracking-tight text-ink">Emails</h2>
        <p className="mt-1 text-[14px] text-muted">
          Update emails go out every hour from the queue: students on Finals first, then the most recently active. Sign-in codes are counted here once the Supabase email hook is switched on.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sent today" value={sentToday} />
        <Stat label="Update emails today" value={`${updatesToday} / ${DAILY_UPDATE_CAP}`} />
        <Stat label="Waiting in the queue" value={pending.count ?? 0} />
        <Stat label="Unsubscribed students" value={unsub.count ?? 0} />
        <Stat label="Limit per student" value={`${WEEKLY_PER_USER} a week`} />
      </div>

      <section>
        <h3 className="text-[17px] font-semibold">Sent, by email</h3>
        <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-tint text-muted">
              <tr><th className="px-4 py-2 font-normal">Email</th><th className="px-4 py-2 font-normal">Today</th><th className="px-4 py-2 font-normal">Last 7 days</th><th className="px-4 py-2 font-normal">All time</th></tr>
            </thead>
            <tbody>
              {TYPES.map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="px-4 py-2">{t.label}</td>
                  <td className="px-4 py-2 tabular-nums">{count(t.id, today)}</td>
                  <td className="px-4 py-2 tabular-nums">{count(t.id, week)}</td>
                  <td className="px-4 py-2 tabular-nums">{count(t.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-[17px] font-semibold">Latest emails sent</h3>
        {(recent.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing sent yet.</p>
        ) : (
          <div className="mt-3 max-h-[480px] overflow-auto rounded-2xl ring-1 ring-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 bg-tint text-muted">
                <tr>{["Sent", "Student", "Email", "Course"].map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(recent.data as unknown as SRow[]).map((s) => (
                  <tr key={s.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(s.sent_at)}</td>
                    <td className="px-4 py-2">{s.profiles?.email ?? "deleted account"}</td>
                    <td className="px-4 py-2">{label(s.type)}</td>
                    <td className="px-4 py-2">{s.courses ? `${s.courses.code} ${s.courses.title}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EmailControls courses={(courses.data ?? []) as { id: string; code: string; title: string; programme: string }[]} />

      <section>
        <h3 className="text-[17px] font-semibold">Queue (latest 100)</h3>
        {(queue.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing queued yet.</p>
        ) : (
          <div className="mt-3 max-h-[480px] overflow-auto rounded-2xl ring-1 ring-line">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-tint text-muted">
                <tr>{["Added", "Student", "Email", "Course", "Status"].map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(queue.data as unknown as QRow[]).map((q) => (
                  <tr key={q.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(q.created_at)}</td>
                    <td className="px-4 py-2">{q.profiles?.email ?? "—"}</td>
                    <td className="px-4 py-2">{label(q.type)}</td>
                    <td className="px-4 py-2">{q.courses ? `${q.courses.code} ${q.courses.title}` : "—"}</td>
                    <td className="px-4 py-2">{q.status}{q.sent_at ? ` · ${when(q.sent_at)}` : ""}{q.reason ? <span className="block text-xs text-muted">{q.reason}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-line">
      <p className="text-[14px] font-medium text-muted">{label}</p>
      <p className="mt-2 text-[30px] font-semibold leading-none tracking-tight tabular-nums text-ink">{value}</p>
    </div>
  );
}
