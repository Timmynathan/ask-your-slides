"use client";

// Past questions (PRD F10): Exam map | Practice, in the study workspace's main area. Opened from
// "Past questions" in the Topics panel, or from a topic chat's "N past questions" chip (practice for
// that topic, with a way back to the chat). Answers are fetched only after an attempt.
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Spinner } from "@/components/ui/spinner";
import {
  buildExamMap,
  effectiveMarks,
  marksLabel,
  oldCode,
  paperLabel,
  paperQuestions,
  practised,
  stems,
  topicQuestions,
  TYPE_LABEL,
  type PastPaper,
  type PastQuestion,
  type QuestionTopic,
} from "@/lib/past/map";
import type { CitationInfo } from "@/lib/study/format";
import { displayCode } from "@/lib/study/format";
import type { CourseItem, TopicItem } from "@/lib/study/types";
import { Answer } from "./answer";

interface PastData {
  papers: PastPaper[];
  questions: PastQuestion[];
  questionTopics: QuestionTopic[];
  attempts: Record<string, { score: number | null; max: number | null; revealed: boolean }>;
}

type Selection = { kind: "topic"; id: string } | { kind: "paper"; id: string };

interface Props {
  course: CourseItem;
  topics: TopicItem[];
  /** Opened from a topic chat's chip: practise this topic, with a way back. */
  topicId: string | null;
  onBack: (() => void) | null;
  onCite(slideKey: string): void;
  onRemaining(remaining: number): void;
  partnerName: string;
}

const cache = new Map<string, Promise<PastData>>();
function loadPast(courseId: string): Promise<PastData> {
  if (!cache.has(courseId)) {
    const p = fetch(`/api/past?course=${courseId}`).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Couldn't load past questions.");
      const d = (await r.json()) as PastData;
      d.papers = d.papers.map((x) => ({ ...x, total_marks: x.total_marks == null ? null : Number(x.total_marks) }));
      return d;
    });
    p.catch(() => cache.delete(courseId));
    cache.set(courseId, p);
  }
  return cache.get(courseId)!;
}

export function PastPanel({ course, topics, topicId, onBack, onCite, onRemaining, partnerName }: Props) {
  const [data, setData] = useState<PastData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"map" | "practice">(topicId ? "practice" : "map");
  const [selection, setSelection] = useState<Selection | null>(topicId ? { kind: "topic", id: topicId } : null);

  useEffect(() => {
    let live = true;
    loadPast(course.id).then((d) => live && setData(d), (e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [course.id]);

  const practise = (s: Selection) => {
    setSelection(s);
    setTab("practice");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-3 pt-1">
        {onBack && (
          <button type="button" onClick={onBack} className="mr-1 rounded-full px-3 py-1.5 text-[13px] text-muted transition hover:bg-sunken hover:text-ink">
            ← Back to chat
          </button>
        )}
        <div className="inline-flex rounded-full bg-sunken p-1" role="tablist" aria-label="Past questions">
          {(["map", "practice"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-[13.5px] transition ${tab === t ? "bg-white text-ink shadow-sm dark:bg-white/10" : "text-muted hover:text-ink"}`}
            >
              {t === "map" ? "Exam map" : "Practice"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        {error ? (
          <p className="mt-10 text-center text-sm text-muted">{error}</p>
        ) : !data ? (
          <div className="mt-16 grid place-items-center text-muted">
            <Spinner />
          </div>
        ) : tab === "map" ? (
          <ExamMapView course={course} topics={topics} data={data} onPractise={practise} />
        ) : selection ? (
          <Practice
            key={`${selection.kind}-${selection.id}`}
            course={course}
            topics={topics}
            data={data}
            selection={selection}
            onChange={() => setSelection(null)}
            onCite={onCite}
            onRemaining={onRemaining}
            partnerName={partnerName}
          />
        ) : (
          <Picker course={course} topics={topics} data={data} onPick={practise} />
        )}
      </div>
    </div>
  );
}

// ── Exam map ───────────────────────────────────────────────
function ExamMapView({ course, topics, data, onPractise }: { course: CourseItem; topics: TopicItem[]; data: PastData; onPractise(s: Selection): void }) {
  const map = useMemo(() => buildExamMap(topics.map((t) => ({ id: t.id, title: t.title })), data.papers, data.questions, data.questionTopics), [topics, data]);
  const total = practised(data.questions.filter((q) => q.origin === "past_paper")).length;

  if (!total) {
    return <p className="mx-auto mt-14 max-w-sm text-center text-[15px] text-muted">No past papers for {displayCode(course.code)} yet.</p>;
  }
  if (map.few) {
    return (
      <div className="mx-auto mt-10 max-w-md text-center">
        <p className="text-[17px] text-ink">Few past papers for this course.</p>
        <p className="mt-2 text-sm text-muted">
          We have {data.papers.map((p) => paperLabel(p)).join(", ")}: not enough to show which topics come up often. You can still practise every question.
        </p>
        <button type="button" onClick={() => onPractise({ kind: "paper", id: data.papers[0].id })} className="mt-5 rounded-full bg-navy px-5 py-2.5 text-sm text-white transition hover:opacity-90 active:scale-95">
          Practise {paperLabel(data.papers[0])}
        </button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4 text-sm text-muted">
        Which topics came up in {displayCode(course.code)}&apos;s last {map.papers.length} papers ({map.papers.map((p) => paperLabel(p)).join(", ")}).
      </p>
      <ul className="space-y-2">
        {map.rows.map((r) => (
          <li key={r.topicId} className="rounded-2xl bg-sunken/60 px-4 py-3">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink">{r.title}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {r.papers.length ? (
                    <>
                      Asked in <span className="font-medium text-ink">{r.papers.length} of {map.papers.length}</span> papers · {r.marks} marks
                      {r.types.length ? ` · ${r.types.map((t) => TYPE_LABEL[t] ?? t).join(", ")}` : ""}
                    </>
                  ) : (
                    "Not asked in these papers"
                  )}
                </p>
                {r.repeats.length > 0 && (
                  <p className="mt-1 text-[12.5px] text-ink/80">
                    <span className="mr-1.5 rounded-full bg-pau-100 px-2 py-0.5 text-[11.5px] text-brand">Asked again</span>
                    {r.repeats.join(" · ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 pt-1" aria-label={`Asked in ${r.papers.length} of ${map.papers.length} papers`}>
                {map.papers.map((p) => (
                  <span
                    key={p.id}
                    title={`${paperLabel(p)}: ${r.papers.includes(p.id) ? "asked" : "not asked"}`}
                    className={`h-3 w-3 rounded-full ${r.papers.includes(p.id) ? "bg-navy dark:bg-[#5ea3ed]" : "border border-line-strong"}`}
                  />
                ))}
              </div>
              {r.questionCount > 0 && (
                <button type="button" onClick={() => onPractise({ kind: "topic", id: r.topicId })} className="rounded-full px-3 py-1 text-[13px] text-brand transition hover:bg-pau-100">
                  Practise {r.questionCount}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-center text-[13px] text-muted">Based on past papers, not a prediction.</p>
    </div>
  );
}

// ── Practice: pick a topic or a paper ──────────────────────
function Picker({ course, topics, data, onPick }: { course: CourseItem; topics: TopicItem[]; data: PastData; onPick(s: Selection): void }) {
  const byTopic = topics.map((t) => ({ t, n: topicQuestions(t.id, data.questions, data.questionTopics, data.papers).length })).filter((x) => x.n > 0);
  const papers = [...data.papers].sort((a, b) => b.session.localeCompare(a.session));
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <section>
        <h3 className="mb-2 text-[13px] text-muted">By topic</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {byTopic.map(({ t, n }) => (
            <button key={t.id} type="button" onClick={() => onPick({ kind: "topic", id: t.id })} className="flex items-center justify-between gap-3 rounded-2xl bg-sunken/60 px-4 py-3 text-left transition hover:bg-sunken">
              <span className="min-w-0 text-[15px] text-ink">{t.title}</span>
              <span className="shrink-0 text-[13px] text-muted">{n}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-[13px] text-muted">Whole paper</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {papers.map((p) => {
            const old = oldCode(p, course.code);
            return (
              <button key={p.id} type="button" onClick={() => onPick({ kind: "paper", id: p.id })} className="rounded-2xl bg-sunken/60 px-4 py-3 text-left transition hover:bg-sunken">
                <span className="block text-[15px] capitalize text-ink">{paperLabel(p)}</span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {[old && `then ${old}`, p.duration, `${paperQuestions(p.id, data.questions).length} questions`].filter(Boolean).join(" · ")}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Practice: one question at a time ───────────────────────
type Result = {
  mode: "marked" | "mcq" | "revealed";
  score?: number;
  max: number;
  correct?: boolean;
  feedback?: { good: string[]; missing: string[]; summary: string };
  model_answer: string | null;
  citations: CitationInfo[];
  answer_key: string | null;
  explanation: string | null;
};

function Practice(props: {
  course: CourseItem;
  topics: TopicItem[];
  data: PastData;
  selection: Selection;
  onChange(): void;
  onCite(key: string): void;
  onRemaining(n: number): void;
  partnerName: string;
}) {
  const { course, topics, data, selection } = props;
  const list = useMemo(
    () =>
      selection.kind === "topic"
        ? topicQuestions(selection.id, data.questions, data.questionTopics, data.papers)
        : paperQuestions(selection.id, data.questions),
    [selection, data],
  );
  const [i, setI] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<"mark" | "reveal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paper = selection.kind === "paper" ? data.papers.find((p) => p.id === selection.id) : null;
  const title = selection.kind === "topic" ? topics.find((t) => t.id === selection.id)?.title ?? "Topic" : paper ? paperLabel(paper) : "Paper";
  const q = list[i];
  if (!q) return <p className="mt-10 text-center text-sm text-muted">No questions here yet.</p>;

  const byId = new Map(data.questions.map((x) => [x.id, x]));
  const max = effectiveMarks(q, byId, data.questions);
  const qPaper = data.papers.find((p) => p.id === q.paper_id);
  const old = qPaper ? oldCode(qPaper, course.code) : null;
  const result = results[q.id];
  const draft = drafts[q.id] ?? "";
  const done = data.attempts[q.id];

  const send = async (payload: { answer?: string; reveal?: true }) => {
    setBusy(payload.reveal ? "reveal" : "mark");
    setError(null);
    try {
      const r = await fetch("/api/past/attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_id: q.id, ...payload }) });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        if (typeof body?.remaining === "number") props.onRemaining(body.remaining);
        throw new Error(body?.error ?? "Something went wrong. Try again.");
      }
      if (typeof body.remaining === "number") props.onRemaining(body.remaining);
      setResults((m) => ({ ...m, [q.id]: body as Result }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <button type="button" onClick={props.onChange} className="rounded-full px-2 py-1 transition hover:bg-sunken hover:text-ink">
          ← All
        </button>
        <span className="min-w-0 truncate capitalize text-ink">{title}</span>
        <span className="ml-auto tabular-nums">
          {i + 1} of {list.length}
        </span>
      </div>
      {paper && i === 0 && (paper.instructions || paper.duration) && (
        <p className="mb-4 rounded-2xl bg-sunken/60 px-4 py-3 text-[13.5px] text-ink/80">
          {[paper.instructions, paper.duration && `Time: ${paper.duration}`].filter(Boolean).join(" · ")}
        </p>
      )}

      <article key={q.id} className="panel-in rounded-[22px] bg-white p-5 shadow-[0_1px_3px_rgb(0_0_0/0.06)] ring-1 ring-line dark:bg-white/5">
        <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          {q.origin === "generated" ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Practice question — not from a past paper</span>
          ) : (
            qPaper && (
              <span className="capitalize">
                {paperLabel(qPaper)}
                {old ? ` · then ${old}` : ""}
              </span>
            )
          )}
          <span>· {q.number}</span>
          {marksLabel(max) && <span>· {marksLabel(max)}</span>}
          {q.relevance === "not_covered" && <span className="rounded-full bg-sunken px-2 py-0.5 text-ink/70">Not in this year&apos;s slides</span>}
          {q.relevance === "partial" && <span className="rounded-full bg-sunken px-2 py-0.5 text-ink/70">Partly in this year&apos;s slides</span>}
          {done && !result && <span className="ml-auto text-emerald-700 dark:text-emerald-300">{done.revealed ? "Answer seen" : `Done · ${done.score}/${done.max}`}</span>}
        </header>

        {stems(q, data.questions).map((s, k) => (
          <details key={k} className="mb-3 rounded-xl bg-sunken/60 px-3 py-2 text-[14px] text-ink/85" open={s.length < 600}>
            <summary className="cursor-pointer text-[13px] text-muted">Question context</summary>
            <Md text={s} />
          </details>
        ))}
        <div className="text-[15.5px] text-ink">
          <Md text={q.text} />
        </div>

        {q.type === "mcq" && q.options ? (
          <div className="mt-4 grid gap-2">
            {q.options.map((o) => {
              const picked = draft === o.label;
              const isKey = result?.answer_key?.toUpperCase() === o.label.toUpperCase();
              const state = !result ? (picked ? "ring-2 ring-navy" : "ring-1 ring-line hover:bg-sunken") : isKey ? "bg-emerald-50 ring-1 ring-emerald-400 dark:bg-emerald-900/30" : picked ? "bg-rose-50 ring-1 ring-rose-300 dark:bg-rose-900/30" : "ring-1 ring-line opacity-70";
              return (
                <button
                  key={o.label}
                  type="button"
                  disabled={!!result || !!busy}
                  onClick={() => {
                    setDrafts((d) => ({ ...d, [q.id]: o.label }));
                    void send({ answer: o.label });
                  }}
                  className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-left text-[14.5px] transition ${state}`}
                >
                  <span className="mt-px font-medium">{o.label}.</span>
                  <span>{o.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          !result && (
            <div className="mt-4">
              <textarea
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                placeholder="Write your answer as you would in the exam…"
                rows={7}
                className="w-full resize-y rounded-xl bg-sunken/60 px-4 py-3 text-[15px] text-ink outline-none ring-1 ring-transparent placeholder:text-muted focus:ring-navy/40"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!draft.trim() || !!busy}
                  onClick={() => send({ answer: draft })}
                  className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm text-white transition enabled:hover:opacity-90 enabled:active:scale-95 disabled:opacity-40"
                >
                  {busy === "mark" && <Spinner />}
                  {busy === "mark" ? "Marking…" : "Mark my answer"}
                </button>
                <button type="button" disabled={!!busy} onClick={() => send({ reveal: true })} className="rounded-full px-4 py-2.5 text-sm text-muted transition hover:bg-sunken hover:text-ink disabled:opacity-40">
                  {busy === "reveal" ? "Loading…" : "Show answer"}
                </button>
              </div>
            </div>
          )
        )}
        {error && <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}

        {result && <ResultView result={result} draft={q.type === "mcq" ? null : draft} course={course} onCite={props.onCite} partnerName={props.partnerName} />}
      </article>

      <div className="mt-4 flex items-center justify-between">
        <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-sunken hover:text-ink disabled:invisible">
          ← Previous
        </button>
        <button type="button" disabled={i >= list.length - 1} onClick={() => setI(i + 1)} className="rounded-full bg-sunken px-5 py-2 text-sm text-ink transition hover:bg-pau-100 disabled:invisible">
          Next question →
        </button>
      </div>
    </div>
  );
}

function ResultView({ result, draft, course, onCite, partnerName }: { result: Result; draft: string | null; course: CourseItem; onCite(k: string): void; partnerName: string }) {
  return (
    <div className="mt-5 space-y-4 border-t border-line pt-4">
      {draft && result.mode === "marked" && (
        <details className="text-[14px] text-ink/80">
          <summary className="cursor-pointer text-[13px] text-muted">Your answer</summary>
          <p className="mt-2 whitespace-pre-wrap">{draft}</p>
        </details>
      )}
      {result.mode === "marked" && result.feedback && (
        <div>
          <p className="flex items-baseline gap-2">
            <span className="text-[26px] font-medium tabular-nums text-ink">≈ {+(result.score ?? 0).toFixed(1)}/{+result.max.toFixed(1)}</span>
            <span className="text-[13px] text-muted">estimated score</span>
          </p>
          <p className="mt-1 text-[14.5px] text-ink/85">{result.feedback.summary}</p>
          {result.feedback.good.length > 0 && <FeedbackList title="Good" items={result.feedback.good} tone="text-emerald-700 dark:text-emerald-300" mark="✓" />}
          {result.feedback.missing.length > 0 && <FeedbackList title="To reach full marks" items={result.feedback.missing} tone="text-amber-700 dark:text-amber-300" mark="+" />}
        </div>
      )}
      {result.mode === "mcq" && (
        <p className={`text-[15px] ${result.correct ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
          {result.correct ? "Correct." : `Not quite: the answer is ${result.answer_key}.`}
        </p>
      )}
      {result.mode === "mcq" && result.explanation ? (
        <Answer text={result.explanation} citations={result.citations} fallback={null} topicTitle={null} courseCode={course.code} courseId={course.id} sortOrder={course.sort_order} onCite={onCite} partnerName={partnerName} />
      ) : (
        result.model_answer && (
          <div>
            <h4 className="mb-2 text-[13px] text-muted">Model answer</h4>
            <Answer text={result.model_answer} citations={result.citations} fallback={null} topicTitle={null} courseCode={course.code} courseId={course.id} sortOrder={course.sort_order} onCite={onCite} partnerName={partnerName} />
          </div>
        )
      )}
    </div>
  );
}

function FeedbackList({ title, items, tone, mark }: { title: string; items: string[]; tone: string; mark: string }) {
  return (
    <div className="mt-3">
      <p className="text-[13px] text-muted">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((s, k) => (
          <li key={k} className="flex gap-2 text-[14.5px] text-ink/90">
            <span className={`shrink-0 ${tone}`}>{mark}</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Md({ text }: { text: string }) {
  return (
    <div className="[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-sunken [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[13px] [&_table]:my-2 [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:border-line-strong [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
