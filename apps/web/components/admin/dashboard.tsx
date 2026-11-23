"use client";

// /admin: the pilot at a glance, then the detail behind it, in tabs (owner, 15 Nov 2026):
//   Overview: headline numbers, daily charts, plans, feedback (every thumbs down).
//   Students: every student, newest first, searchable by email and filtered by department.
//   Answers: the latest answers with cost, speed, tools, citations, errors.
//   Courses: every course with its students and questions, grouped by department.
//   Health: error codes, slowest and most expensive answers.
// Read-only. Data: public.admin_overview() via the server. The tab is kept in the URL (?tab=).
import { errorInfo, splitErrors } from "@/lib/admin/error-codes";
import { Download, ThumbsDown, ThumbsUp } from "lucide-react";
import { featureLabel } from "@/lib/feedback-features";
import type { PlanStats } from "@/lib/plans/admin-stats";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Logo } from "@/components/brand/logo";
import { AccountMenu } from "@/components/ui/account-menu";
import { RANGES, TABS, type Overview, type Range, type Tab } from "@/lib/admin-shared";
import { BarList, ColumnChart } from "./charts";

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

export type CourseRow = Overview["courses"][number] & { department: string };

export function AdminDashboard({ data, courses, plans, heardFrom, appFeedback, range, tab: initialTab, email }: { data: Overview; courses: CourseRow[]; plans: PlanStats; heardFrom: { label: string; n: number }[]; appFeedback: AppFeedbackRow[]; range: Range; tab: Tab; email: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [tab, setTab] = useState<Tab>(initialTab);
  const t = data.totals;
  // Real students' answers only: a test run's account is deleted afterwards, so its answer has no
  // student (owner, 21 Nov 2026: test runs showed up as errors).
  const studentAnswers = data.recent.filter((r) => r.student);
  const withProblems = studentAnswers.filter((r) => splitErrors(r.errors).problems.length > 0).length;
  const href = (r: Range, x: Tab) => `/admin?range=${r}${x === "overview" ? "" : `&tab=${x}`}`;
  function open(x: Tab) {
    setTab(x);
    window.history.replaceState(null, "", href(range, x));
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="min-h-dvh bg-page text-ink">
      <header className="sticky top-0 z-20 bg-page/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboard" aria-label="My courses">
            <Logo size={24} />
          </Link>
          <span className="text-[14px] text-muted">Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-full bg-sunken p-1 sm:flex" role="group" aria-label="Period">
              {RANGES.map((r) => (
                <Link
                  key={r.id}
                  href={href(r.id, tab)}
                  aria-current={range === r.id ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-[13px] transition ${range === r.id ? "bg-card font-medium text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
            <Link href="/admin/payments" className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-ink transition hover:bg-navy-hover">
              Payments
            </Link>
            <Link href="/admin/promo" className="rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line-strong transition hover:bg-sunken">
              Promo codes
            </Link>
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              disabled={refreshing}
              className="rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line-strong transition hover:bg-sunken active:scale-95 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <AccountMenu user={{ email, displayName: null }} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-10 px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        <div>
          <h1 className="text-[28px] font-normal tracking-tight text-ink sm:text-[32px]">Admin</h1>
          <p className="mt-1 text-sm text-muted">
            {RANGES.find((r) => r.id === range)?.label} · from {when(data.from)} · updated {when(data.generated_at)} (WAT)
          </p>
        </div>

        {/* Tabs as pills, like the student dashboard's "All courses / Recently studied". */}
        <div className="-mt-4 overflow-x-auto" role="tablist" aria-label="Dashboard sections">
          <div className="flex min-w-max gap-1">
            {TABS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`tab-${x.id}`}
                aria-selected={tab === x.id}
                aria-controls={`panel-${x.id}`}
                onClick={() => open(x.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition active:scale-95 ${tab === x.id ? "bg-sunken font-medium text-ink" : "text-ink hover:bg-sunken/60"}`}
              >
                {x.label}
                {x.id === "health" && withProblems > 0 && <span className="ml-1.5 rounded-full bg-red-50 px-1.5 text-xs text-red-800">{withProblems}</span>}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && (
          <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" className="space-y-14">

        {/* Overview */}
        <section id="overview" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Tile label="Students signed up" value={n(t.students_signed_up)} sub={`${n(t.students_onboarded)} onboarded · ${n(t.new_students)} new in period`} />
            <Tile label="Active students" value={n(t.active_students)} sub="asked a question or practised past questions, in this period" />
            <Tile
              label="Regular students"
              value={t.regular_students != null ? n(t.regular_students) : "—"}
              sub={t.regular_students != null ? "studied on 3+ different days in this period" : "appears once the database update is pushed"}
            />
            <Tile label="Questions" value={n(t.questions)} sub={`${n(t.answers)} answers`} />
            <Tile label="Cost" value={usd(t.cost_usd)} sub={`${usd(t.cost_per_answer)} per answer`} />
            <Tile label="Is it helping? (1–5)" value={t.helping_avg != null ? String(t.helping_avg) : "—"} sub={`${n(t.helping_n)} answers`} />
            <Tile label="Time to first word" value={secs(t.avg_ttft_ms)} sub="average" />
            <Tile label="Slowest 5% of answers" value={secs(t.p95_latency_ms)} sub="p95 full answer" />
            <Tile
              label="Answers with problems"
              value={pct(withProblems, studentAnswers.length)}
              sub={`${n(withProblems)} of the latest ${n(studentAnswers.length)} students' answers`}
              warn={studentAnswers.length > 0 && withProblems / studentAnswers.length > 0.05}
            />
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

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Is this helping you study? (1–5)">
              <BarList rows={data.helping.map((h) => ({ label: `${h.score} ${h.score === 1 ? "· not really" : h.score === 5 ? "· a lot" : ""}`, n: h.n }))} />
            </Card>
            <Card title="Study partners chosen">
              <BarList rows={data.partners.map((p) => ({ label: PARTNER[p.partner] ?? p.partner, n: p.n }))} />
            </Card>
            <Card title="Departments">
              <BarList rows={data.departments.map((d) => ({ label: d.department, n: d.n }))} />
            </Card>
            <Card title="How they found us (sign-ups in this period)">
              <BarList rows={heardFrom} />
            </Card>
          </div>
        </section>

        <Plans plans={plans} />
          </div>
        )}

        {tab === "feedback" && (
          <div role="tabpanel" id="panel-feedback" aria-labelledby="tab-feedback" className="space-y-10">
            <GeneralFeedback rows={appFeedback} />
            <Feedback data={data} />
          </div>
        )}

        {tab === "students" && (
          <div role="tabpanel" id="panel-students" aria-labelledby="tab-students">
            <Students data={data} />
          </div>
        )}

        {tab === "answers" && (
          <div role="tabpanel" id="panel-answers" aria-labelledby="tab-answers">
            <Answers range={range} />
          </div>
        )}

        {tab === "courses" && (
          <div role="tabpanel" id="panel-courses" aria-labelledby="tab-courses">
            <Courses courses={courses} />
          </div>
        )}

        {tab === "health" && (
          <div role="tabpanel" id="panel-health" aria-labelledby="tab-health">
        {/* Health */}
        <section id="health" className="scroll-mt-24 space-y-4">
          <SectionTitle title="Health" note="Slow or expensive answers, and what went wrong." />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="What the server fixed or flagged">
              <BarList rows={data.error_codes.map((e) => ({ label: `${errorInfo(e.code).problem ? "Problem: " : "Fixed: "}${errorInfo(e.code).label}`, n: e.n }))} />
              <p className="mt-3 text-xs text-muted">&ldquo;Fixed&rdquo; happened before the student saw the answer. Counts include test runs.</p>
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

          </div>
        )}
      </main>
    </div>
  );
}

/** Every course, grouped by department (busiest first), with who's asking and what it costs. */
function Courses({ courses }: { courses: CourseRow[] }) {
  const [active, setActive] = useState(false);
  const groups = useMemo(() => {
    const by = new Map<string, CourseRow[]>();
    for (const c of courses) if (!active || c.questions > 0) by.set(c.department, [...(by.get(c.department) ?? []), c]);
    return [...by.entries()]
      .map(([department, rows]) => ({
        department,
        rows: [...rows].sort((a, b) => b.questions - a.questions),
        questions: rows.reduce((s, c) => s + c.questions, 0),
        cost: rows.reduce((s, c) => s + Number(c.cost_usd), 0),
      }))
      .sort((a, b) => b.questions - a.questions || a.department.localeCompare(b.department));
  }, [courses, active]);
  const asked = courses.filter((c) => c.questions > 0).length;
  return (
    <section className="space-y-6">
      <SectionTitle
        title="Courses"
        note={`${asked} of ${courses.length} courses had questions in this period. Students are counted per course, so one student can appear in several.`}
        action={
          <div className="flex gap-1.5">
            <Chip on={!active} onClick={() => setActive(false)}>
              All courses
            </Chip>
            <Chip on={active} onClick={() => setActive(true)}>
              With questions
            </Chip>
          </div>
        }
      />
      {groups.length === 0 && <Empty>No questions in this period.</Empty>}
      {groups.map((g) => (
        <div key={g.department} className="rounded-[22px] bg-sunken/60 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-1">
            <h3 className="text-[17px] font-medium">{g.department}</h3>
            <p className="text-xs tabular-nums text-muted">
              {n(g.questions)} questions · {usd(g.cost)}
            </p>
          </div>
          <Table
            compact
            head={["Course", "Students", "Questions", "Cost", "Up", "Down", "Thumbs up"]}
            rows={g.rows.map((c) => [
              <span key="c" className={c.questions ? "" : "text-muted"}>
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
        </div>
      ))}
    </section>
  );
}

export interface AppFeedbackRow {
  id: string;
  createdAt: string;
  message: string;
  sentiment: "good" | "bad" | null;
  features: string[];
  page: string | null;
  email: string;
}

/** Messages from the Feedback button (owner, 20 Nov 2026), newest first. */
function GeneralFeedback({ rows }: { rows: AppFeedbackRow[] }) {
  return (
    <section className="space-y-4">
      <SectionTitle title="General feedback" note="From the Feedback button in the app. Newest first; the last 50." />
      {rows.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card ring-1 ring-line">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}</span>
                <span>· {r.email}</span>
                {r.page && <span>· {r.page}</span>}
                {r.sentiment && (
                  <span className={`rounded-full px-2 py-0.5 font-medium ${r.sentiment === "good" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                    {r.sentiment === "good" ? "Good" : "Bad"}
                  </span>
                )}
                {r.features.map((f) => (
                  <span key={f} className="rounded-full bg-sunken px-2 py-0.5 text-ink">
                    {featureLabel(f)}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{r.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Feedback({ data }: { data: Overview }) {
  const [reason, setReason] = useState<string | null>(null);
  const items = data.thumbs_down.filter((f) => !reason || (f.reason ?? "no reason") === reason);
  return (
    <section id="feedback" className="scroll-mt-24 space-y-4">
      <SectionTitle title="Answers rated down" note="Every thumbs down on an answer in this period, newest first, with the question and the full answer." />
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
                  <details className="group rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
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
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-sunken/50 p-3 font-sans text-[13.5px] leading-relaxed">{readable(f.answer)}</pre>
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

function Answers({ range }: { range: Range }) {
  // One page at a time from /api/admin/answers: every student answer in the period, with the
  // filter and search applied to all of them (owner, 21 Nov 2026).
  // Opens on "Needs attention" (owner, 23 Nov 2026): the answers worth a look, each with its reasons.
  const [filter, setFilter] = useState<"attention" | "all" | "down" | "errors" | "slow">("attention");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState(""); // the search, once typing pauses
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ rows: Overview["recent"]; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/answers?range=${range}&page=${page}&filter=${filter}&q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
        .then((d) => live && setResult(d))
        .catch(() => live && setResult({ rows: [], total: 0, pages: 1 }))
        .finally(() => live && setLoading(false));
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [range, page, filter, query]);
  const items = result?.rows ?? [];
  return (
    <section id="answers" className="scroll-mt-24 space-y-4">
      <SectionTitle
        title="Answers"
        note={result ? `${n(result.total)} students' answers in this period (test runs hidden). Open one to read it in full.` : "Loading…"}
        action={<DownloadButton onClick={() => downloadCsv("answers.csv", items.map(({ answer, ...r }) => ({ ...r, answer: readable(answer) })))} />}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["attention", "Needs attention"],
            ["all", "All"],
            ["down", "Thumbs down"],
            ["errors", "With problems"],
            ["slow", "Slower than 15 s"],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            on={filter === id}
            onClick={() => {
              setFilter(id);
              setPage(1);
            }}
          >
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
      {loading && !items.length ? (
        <Empty>Loading answers…</Empty>
      ) : items.length === 0 ? (
        <Empty>No answers match.</Empty>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id}>
              <details className="rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="grid w-5 place-items-center text-muted" aria-label={r.rating === 1 ? "thumbs up" : r.rating === -1 ? "thumbs down" : "not rated"}>
                    {r.rating === 1 ? <ThumbsUp size={14} absoluteStrokeWidth strokeWidth={1.5} aria-hidden /> : r.rating === -1 ? <ThumbsDown size={14} absoluteStrokeWidth strokeWidth={1.5} className="text-red-700" aria-hidden /> : "·"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px]">{r.question}</span>
                  {(r.reasons ?? []).map((why) => (
                    <span key={why} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      {why}
                    </span>
                  ))}
                  {(() => {
                    const { problems, fixes } = splitErrors(r.errors);
                    return problems.length > 0 ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-800">{problems.length} problem{problems.length > 1 ? "s" : ""}</span>
                    ) : fixes > 0 ? (
                      <span className="rounded-full bg-sunken px-2 py-0.5 text-xs text-muted" title="Fixed before the student saw the answer">{fixes} fixed</span>
                    ) : null;
                  })()}
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
                    <ul className="space-y-1 rounded-xl bg-page px-3 py-2 text-xs">
                      {r.errors.map((e, i) => (
                        <li key={i} className={errorInfo(e.code).problem ? "text-red-800" : "text-muted"}>
                          <span className="font-medium">{errorInfo(e.code).problem ? "Problem: " : "Fixed: "}{errorInfo(e.code).label}</span>
                          {e.detail ? <span className="text-muted"> · {e.detail}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-sunken/50 p-3 font-sans text-[13.5px] leading-relaxed">{readable(r.answer) || "(no answer text: the turn failed)"}</pre>
                  <ReplayCaseButton row={r} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {result && result.pages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Pages of answers">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="rounded-full px-4 py-2 text-sm ring-1 ring-line transition hover:bg-sunken disabled:opacity-40">
            Previous
          </button>
          <span className="px-2 text-sm text-muted">
            Page {page} of {result.pages}
          </span>
          <button type="button" disabled={page >= result.pages || loading} onClick={() => setPage((p) => p + 1)} className="rounded-full px-4 py-2 text-sm ring-1 ring-line transition hover:bg-sunken disabled:opacity-40">
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

/** Copies the answer as a replay case (data/evals/replay-cases.json), so a bad answer becomes a check
 *  that proves the fix (owner, 23 Nov 2026). Paste it into that file and fill in must / mustNot. */
function ReplayCaseButton({ row }: { row: Overview["recent"][number] }) {
  const [copied, setCopied] = useState(false);
  if (!row.asked_at) return null;
  const asked = row.asked_at;
  const caseJson = () =>
    JSON.stringify(
    {
      id: Number(String(Date.now()).slice(-6)),
      student: "Student",
      when: asked.slice(0, 16),
      question: row.question,
      what: (row.reasons ?? []).join("; ") || "describe what a good answer does",
      must: [],
      mustNot: [],
    },
    null,
    1,
  );
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(caseJson()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="rounded-full px-3 py-1.5 text-xs ring-1 ring-line transition hover:bg-sunken"
      title="For data/evals/replay-cases.json: the replay check re-asks it on the live site"
    >
      {copied ? "Copied" : "Copy as replay case"}
    </button>
  );
}

function Students({ data }: { data: Overview }) {
  // Its own tab (owner, 21 Nov 2026): newest sign-up at the top, earliest at the bottom; search by
  // email or name, filter by department. Thumbs up/down left out (students don't use them yet).
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const departments = useMemo(() => [...new Set(data.students.map((s) => s.department).filter(Boolean))].sort() as string[], [data.students]);
  const rows = useMemo(
    () =>
      data.students
        .filter((s) => (!q.trim() || `${s.email} ${s.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) && (!dept || s.department === dept))
        .sort((a, b) => b.joined.localeCompare(a.joined)),
    [data.students, q, dept],
  );
  const csv = rows.map((s) => ({
    name: s.name ?? "",
    email: s.email,
    department: s.department ?? "",
    onboarded: s.onboarded ? "yes" : "no",
    questions_in_period: s.questions,
    questions_all_time: s.questions_all_time,
    cost_usd: s.cost_usd,
    helping: s.helping ?? "",
    partner: s.partner ? PARTNER[s.partner] ?? s.partner : "",
    last_active: s.last_active ?? "",
    joined: s.joined,
  }));
  return (
    <section id="students" className="scroll-mt-24 space-y-4">
      <SectionTitle
        title="Students"
        note={`${n(rows.length)} of ${n(data.students.length)} students, newest first. Questions and cost are for the selected period; the rest is all-time.`}
        action={<DownloadButton onClick={() => downloadCsv("students.csv", csv)} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email or name"
          aria-label="Search students"
          className="h-9 w-full rounded-full bg-sunken px-4 text-sm outline-none focus:ring-2 focus:ring-pau-200 sm:w-72"
        />
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label="Filter by department"
          className="h-9 rounded-full bg-sunken px-4 text-sm outline-none focus:ring-2 focus:ring-pau-200"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <Table
        head={["Student", "Department", "Questions", "All time", "Cost", "Helping", "Partner", "Last active", "Joined"]}
        rows={rows.map((s) => [
          <span key="s" className="block max-w-[16rem] truncate" title={s.email}>
            {s.name ? <span className="font-medium">{s.name} </span> : null}
            <span className="text-muted">{s.email}</span>
            {!s.onboarded && <span className="ml-1 text-xs text-amber-800">(not onboarded)</span>}
          </span>,
          s.department ?? "—",
          n(s.questions),
          n(s.questions_all_time),
          usd(s.cost_usd),
          s.helping ?? "—",
          s.partner ? PARTNER[s.partner] ?? s.partner : "—",
          when(s.last_active),
          when(s.joined),
        ])}
        empty="No students match."
      />
    </section>
  );
}


/** PRD F12: what Finals is earning, who referred it, and which limits push students to the sheet. */
function Plans({ plans: p }: { plans: PlanStats }) {
  return (
    <section id="plans" className="scroll-mt-24 space-y-4">
      <SectionTitle title="Plans" note="Payments in the period; active plans right now." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Finals sold" value={n(p.paid)} sub={`${n(p.pending)} waiting for approval`} />
        <Tile label="Revenue" value={`₦${n(p.revenueNaira)}`} sub="approved bank transfers" />
        <Tile label="Finals active now" value={n(p.activeFinals.manual + p.activeFinals.comp + p.activeFinals.promo)} sub={`${n(p.activeFinals.manual)} paid · ${n(p.activeFinals.promo)} promo trial · ${n(p.activeFinals.comp)} comp`} />
      </div>
    </section>
  );
}

// ── small pieces ───────────────────────────────────────────

function Tile({ label, value, sub, warn = false }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${warn ? "bg-amber-50 ring-amber-200 dark:bg-amber-400/10 dark:ring-amber-400/30" : "bg-card ring-line"}`}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1.5 text-[26px] font-normal tabular-nums tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs leading-snug text-muted">{sub}</p>}
    </div>
  );
}

/** Each step's count, its share of everyone who signed up, and how many stopped at that step. */

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-card p-5 ring-1 ring-line ${className}`}>
      <h3 className="mb-4 text-sm font-medium text-ink">{title}</h3>
      {children}
    </div>
  );
}

function SectionTitle({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-[20px] font-normal tracking-tight text-ink">{title}</h2>
        {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      </div>
      {action}
    </div>
  );
}

function Table({ head, rows, compact = false, empty = "Nothing yet." }: { head: string[]; rows: React.ReactNode[][]; compact?: boolean; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className={`overflow-x-auto ${compact ? "" : "rounded-2xl bg-card ring-1 ring-line"}`}>
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
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm text-ink ring-1 ring-line-strong transition hover:bg-sunken active:scale-95">
      <Download size={15} absoluteStrokeWidth strokeWidth={1.5} aria-hidden />
      Download CSV
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-card px-4 py-6 text-center text-sm text-muted ring-1 ring-line">{children}</p>;
}
