"use client";

// /admin: the pilot at a glance, then the detail behind it. Sections: Overview (headline numbers +
// daily charts), Feedback (every thumbs down with the question and answer), Answers (latest
// answers with cost, speed, tools, citations, errors), Courses, Students, Health (slowest,
// costliest, error codes). Read-only. Data: public.admin_overview() via the server.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Logo } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";
import { RANGES, type Overview, type Range } from "@/lib/admin-shared";
import { BarList, ColumnChart } from "./charts";
import { ResetPassword } from "./reset-password";

const tz = "Africa/Lagos";
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz });
const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz });

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-GB");
const usd = (v: number | null | undefined) => {
  const x = Number(v ?? 0);
  return x === 0 ? "$0" : x < 0.01 ? `$${x.toFixed(4)}` : x < 10 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`;
};
const secs = (ms: number | null | undefined) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
const day = (iso: string) => dayFmt.format(new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")));
const when = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "—");

const REASON: Record<string, string> = { wrong: "Wrong", not_in_slides: "Not in my slides", too_long: "Too long", other: "Other", "no reason": "No reason given" };
const PARTNER: Record<string, string> = { tobi: "Tobi", ada: "Ada", musa: "Dr. Musa", zara: "Zara" };

/** Show stored answers readably: citation markers as [KEY], the beyond-the-slides box marked. */
function readable(text: string | null) {
  return (text ?? "")
    .replace(/\s*\[\[s:([A-Za-z0-9-]+)\]\]/g, " [$1]")
    .replace(/<general>/g, "\n┌ beyond the slides\n")
    .replace(/<\/general>/g, "\n└\n")
    .trim();
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const SECTIONS = [
  ["overview", "Overview"],
  ["feedback", "Feedback"],
  ["answers", "Answers"],
  ["courses", "Courses"],
  ["students", "Students"],
  ["health", "Health"],
] as const;

export function AdminDashboard({ data, range, email }: { data: Overview; range: Range; email: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const t = data.totals;
  const rated = t.thumbs_up + t.thumbs_down;

  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" aria-label="My courses">
            <Logo size={24} />
          </Link>
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-ink">Admin</span>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full px-3 py-1.5 text-sm text-ink/80 hover:bg-sunken hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-full bg-sunken p-1 sm:flex" role="group" aria-label="Period">
              {RANGES.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin?range=${r.id}`}
                  aria-current={range === r.id ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-[13px] transition ${range === r.id ? "bg-page font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              disabled={refreshing}
              className="rounded-full px-3 py-1.5 text-sm text-ink ring-1 ring-line transition hover:bg-sunken active:scale-95 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <AccountMenu user={{ email, displayName: null }} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-14 px-4 pb-24 pt-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[28px] tracking-tight">Pilot dashboard</h1>
          <p className="text-sm text-muted">
            {RANGES.find((r) => r.id === range)?.label} · from {when(data.from)} · updated {when(data.generated_at)} (WAT)
          </p>
        </div>

        {/* Overview */}
        <section id="overview" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Students signed up" value={n(t.students_signed_up)} sub={`${n(t.students_onboarded)} onboarded · ${n(t.new_students)} new in period`} />
            <Tile label="Active students" value={n(t.active_students)} sub={`${n(t.returning_3plus)} came back on 3+ days`} />
            <Tile label="Questions" value={n(t.questions)} sub={`${n(t.answers)} answers`} />
            <Tile label="Cost" value={usd(t.cost_usd)} sub={`${usd(t.cost_per_answer)} per answer`} />
            <Tile label="Thumbs up" value={pct(t.thumbs_up, rated)} sub={`${n(t.thumbs_up)} up · ${n(t.thumbs_down)} down`} />
            <Tile label="Is it helping? (1–5)" value={t.helping_avg != null ? String(t.helping_avg) : "—"} sub={`${n(t.helping_n)} answers`} />
            <Tile label="Time to first word" value={secs(t.avg_ttft_ms)} sub="average" />
            <Tile label="Slowest 5% of answers" value={secs(t.p95_latency_ms)} sub="p95 full answer" />
            <Tile label="Answers with errors" value={pct(t.answers_with_errors, t.answers)} sub={`${n(t.answers_with_errors)} of ${n(t.answers)}`} warn={t.answers > 0 && t.answers_with_errors / t.answers > 0.05} />
            <Tile label="Daily limit reached" value={n(t.cap_hits)} sub="student-days at the cap" />
            <Tile label="Feedback given" value={n(rated)} sub={pct(rated, t.answers) + " of answers rated"} />
            <Tile label="Cost per student" value={usd(t.active_students ? t.cost_usd / t.active_students : 0)} sub="per active student" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Questions per day">
              <ColumnChart label="Questions per day" points={data.daily.map((d) => ({ x: day(d.day), y: d.questions, tip: `questions · ${day(d.day)}` }))} format={(v) => n(Math.round(v))} />
            </Card>
            <Card title="Active students per day">
              <ColumnChart label="Active students per day" points={data.daily.map((d) => ({ x: day(d.day), y: d.active, tip: `students · ${day(d.day)}` }))} format={(v) => n(Math.round(v))} />
            </Card>
            <Card title="Cost per day (USD)">
              <ColumnChart label="Cost per day" points={data.daily.map((d) => ({ x: day(d.day), y: Number(d.cost_usd), tip: `· ${day(d.day)}` }))} format={usd} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Is this helping you study? (1–5)">
              <BarList rows={data.helping.map((h) => ({ label: `${h.score} ${h.score === 1 ? "· not really" : h.score === 5 ? "· a lot" : ""}`, n: h.n }))} />
            </Card>
            <Card title="Study partners chosen">
              <BarList rows={data.partners.map((p) => ({ label: PARTNER[p.partner] ?? p.partner, n: p.n }))} />
            </Card>
            <Card title="Departments">
              <BarList rows={data.departments.map((d) => ({ label: d.department, n: d.n }))} />
            </Card>
          </div>
        </section>

        <Feedback data={data} />
        <Answers data={data} />

        {/* Courses */}
        <section id="courses" className="scroll-mt-24">
          <SectionTitle title="Courses" />
          <Table
            head={["Course", "Students", "Questions", "Cost", "👍", "👎", "Thumbs up"]}
            rows={data.courses.map((c) => [
              <span key="c">
                <span className="font-medium">{c.code.replace(/^([A-Z]+)/, "$1 ")}</span> <span className="text-muted">{c.title}</span>
              </span>,
              n(c.students),
              n(c.questions),
              usd(c.cost_usd),
              n(c.thumbs_up),
              n(c.thumbs_down),
              pct(c.thumbs_up, c.thumbs_up + c.thumbs_down),
            ])}
          />
        </section>

        <Students data={data} />

        {/* Health */}
        <section id="health" className="scroll-mt-24 space-y-4">
          <SectionTitle title="Health" note="Slow or expensive answers, and what went wrong." />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Error codes">
              <BarList rows={data.error_codes.map((e) => ({ label: e.code, n: e.n }))} />
            </Card>
            <Card title="Slowest answers" className="lg:col-span-2">
              <Table
                compact
                head={["When", "Course", "Question", "Total", "First word", "Cost"]}
                rows={data.slowest.map((s) => [when(s.created_at), s.course ?? "—", <Clip key="q" text={s.question} />, secs(s.latency_ms), secs(s.ttft_ms), usd(s.cost_usd)])}
              />
            </Card>
          </div>
          <Card title="Most expensive answers">
            <Table
              compact
              head={["When", "Course", "Question", "Cost", "Tokens in", "Tokens out"]}
              rows={data.costliest.map((s) => [when(s.created_at), s.course ?? "—", <Clip key="q" text={s.question} />, usd(s.cost_usd), n(s.input_tokens), n(s.output_tokens)])}
            />
          </Card>
        </section>

        <section id="support" className="scroll-mt-24 space-y-4">
          <SectionTitle title="Password resets" note="When a student presses “Escalate to admin”, you get an email at hello@. Set a temporary password here and reply with it." />
          <Card title="Reset a student's password">
            <ResetPassword />
          </Card>
        </section>
      </main>
    </div>
  );
}

function Feedback({ data }: { data: Overview }) {
  const [reason, setReason] = useState<string | null>(null);
  const items = data.thumbs_down.filter((f) => !reason || (f.reason ?? "no reason") === reason);
  return (
    <section id="feedback" className="scroll-mt-24 space-y-4">
      <SectionTitle title="Feedback" note="Every thumbs down in this period, newest first, with the question and the full answer." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Why answers got a thumbs down">
          <BarList rows={data.reasons.map((r) => ({ label: REASON[r.reason] ?? r.reason, n: r.n }))} />
        </Card>
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip on={!reason} onClick={() => setReason(null)}>
              All ({data.thumbs_down.length})
            </Chip>
            {data.reasons.map((r) => (
              <Chip key={r.reason} on={reason === r.reason} onClick={() => setReason(r.reason)}>
                {REASON[r.reason] ?? r.reason} ({r.n})
              </Chip>
            ))}
          </div>
          {items.length === 0 ? (
            <Empty>No thumbs down in this period.</Empty>
          ) : (
            <ul className="space-y-2">
              {items.map((f, i) => (
                <li key={i}>
                  <details className="group rounded-2xl bg-sunken/60 px-4 py-3 open:bg-sunken">
                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">{REASON[f.reason ?? "no reason"] ?? f.reason}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px]">{f.question ?? "(question not logged)"}</span>
                      <span className="text-xs text-muted">
                        {f.course ?? "—"} · {when(f.created_at)}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2 text-sm">
                      {f.comment && <p className="rounded-xl bg-page px-3 py-2">“{f.comment}”</p>}
                      <p className="text-xs text-muted">
                        {f.student ?? "deleted account"} · {usd(f.cost_usd)} · {secs(f.latency_ms)}
                      </p>
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-page p-3 font-sans text-[13.5px] leading-relaxed">{readable(f.answer)}</pre>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Answers({ data }: { data: Overview }) {
  const [filter, setFilter] = useState<"all" | "down" | "errors" | "slow">("all");
  const [q, setQ] = useState("");
  const items = useMemo(
    () =>
      data.recent.filter(
        (r) =>
          (filter === "all" ||
            (filter === "down" && r.rating === -1) ||
            (filter === "errors" && r.errors.length > 0) ||
            (filter === "slow" && (r.latency_ms ?? 0) > 15000)) &&
          (!q.trim() || `${r.question} ${r.course} ${r.student}`.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [data.recent, filter, q],
  );
  return (
    <section id="answers" className="scroll-mt-24 space-y-4">
      <SectionTitle
        title="Answers"
        note={`The latest ${data.recent.length} answers in this period. Open one to read it in full.`}
        action={<DownloadButton onClick={() => downloadCsv("answers.csv", data.recent.map(({ answer, ...r }) => ({ ...r, answer: readable(answer) })))} />}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "All"],
            ["down", "Thumbs down"],
            ["errors", "With errors"],
            ["slow", "Slower than 15 s"],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} on={filter === id} onClick={() => setFilter(id)}>
            {label}
          </Chip>
        ))}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search questions, courses, students"
          aria-label="Search answers"
          className="ml-auto h-9 w-full rounded-full bg-sunken px-4 text-sm outline-none focus:ring-2 focus:ring-pau-200 sm:w-72"
        />
      </div>
      {items.length === 0 ? (
        <Empty>No answers match.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id}>
              <details className="rounded-2xl bg-sunken/60 px-4 py-3 open:bg-sunken">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-5 text-center" aria-label={r.rating === 1 ? "thumbs up" : r.rating === -1 ? "thumbs down" : "not rated"}>
                    {r.rating === 1 ? "👍" : r.rating === -1 ? "👎" : "·"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px]">{r.question}</span>
                  {r.errors.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">{r.errors.length} error{r.errors.length > 1 ? "s" : ""}</span>}
                  <span className="text-xs tabular-nums text-muted">
                    {r.course ?? "—"} · {usd(r.cost_usd)} · {secs(r.latency_ms)} · {when(r.created_at)}
                  </span>
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-xs text-muted">
                    {r.student ?? "deleted account"} · first word {secs(r.ttft_ms)} · {n(r.input_tokens)} in / {n(r.output_tokens)} out tokens · {r.cited} slides cited
                    {r.invalid_citations ? ` · ${r.invalid_citations} invalid citations removed` : ""} · tools: {r.tools.join(", ") || "none"}
                  </p>
                  {r.errors.length > 0 && (
                    <ul className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {r.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-medium">{e.code}</span> {e.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-page p-3 font-sans text-[13.5px] leading-relaxed">{readable(r.answer) || "(no answer text: the turn failed)"}</pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Students({ data }: { data: Overview }) {
  const [q, setQ] = useState("");
  const rows = data.students.filter((s) => !q.trim() || `${s.email} ${s.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section id="students" className="scroll-mt-24 space-y-4">
      <SectionTitle
        title="Students"
        note="Questions and cost are for the selected period; the rest is all-time."
        action={<DownloadButton onClick={() => downloadCsv("students.csv", data.students)} />}
      />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by email or name"
        aria-label="Search students"
        className="h-9 w-full rounded-full bg-sunken px-4 text-sm outline-none focus:ring-2 focus:ring-pau-200 sm:w-72"
      />
      <Table
        head={["Student", "Questions", "All time", "Cost", "👍", "👎", "Helping", "Partner", "Last active", "Joined"]}
        rows={rows.map((s) => [
          <span key="s" className="block max-w-[16rem] truncate" title={s.email}>
            {s.name ? <span className="font-medium">{s.name} </span> : null}
            <span className="text-muted">{s.email}</span>
            {!s.onboarded && <span className="ml-1 text-xs text-amber-800">(not onboarded)</span>}
          </span>,
          n(s.questions),
          n(s.questions_all_time),
          usd(s.cost_usd),
          n(s.thumbs_up),
          n(s.thumbs_down),
          s.helping ?? "—",
          s.partner ? PARTNER[s.partner] ?? s.partner : "—",
          when(s.last_active),
          when(s.joined),
        ])}
        empty="No students yet."
      />
    </section>
  );
}

// ── small pieces ───────────────────────────────────────────

function Tile({ label, value, sub, warn = false }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-[22px] p-4 ${warn ? "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-400/10 dark:ring-amber-400/30" : "bg-sunken/60"}`}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 text-[26px] font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[22px] bg-sunken/60 p-5 ${className}`}>
      <h3 className="mb-4 text-[15px] font-medium">{title}</h3>
      {children}
    </div>
  );
}

function SectionTitle({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[22px] tracking-tight">{title}</h2>
        {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      </div>
      {action}
    </div>
  );
}

function Table({ head, rows, compact = false, empty = "Nothing yet." }: { head: string[]; rows: React.ReactNode[][]; compact?: boolean; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className={`overflow-x-auto ${compact ? "" : "rounded-[22px] bg-sunken/60"}`}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-muted">
            {head.map((h, i) => (
              <th key={h} className={`whitespace-nowrap px-4 py-2.5 font-normal ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line/70">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 ${j > 0 ? "whitespace-nowrap text-right tabular-nums" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Clip({ text }: { text: string }) {
  return (
    <span className="block max-w-[28rem] truncate text-left" title={text}>
      {text}
    </span>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-[13px] transition active:scale-95 ${on ? "bg-brand text-brand-ink" : "bg-sunken text-ink hover:bg-pau-100"}`}
    >
      {children}
    </button>
  );
}

function DownloadButton({ onClick }: { onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full px-3 py-1.5 text-sm text-ink ring-1 ring-line transition hover:bg-sunken active:scale-95">
      Download CSV
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-sunken/60 px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
