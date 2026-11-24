"use client";

// Past questions (PRD F10): practice, in the study workspace's main area (the Exam map tab was
// removed, owner 17 Nov 2026: students found it confusing; questions + answers are enough). Opened from
// "Past questions" in the Topics panel, or from a topic chat's "N past questions" chip (practice for
// that topic, with a way back to the chat). Answers are fetched only after an attempt.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDictation } from "@/lib/ui/use-dictation";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import { MATH_REHYPE, MATH_REMARK } from "@/lib/study/math";
import { Spinner } from "@/components/ui/spinner";
import {
  effectiveMarks,
  GENERAL_NOTICE,
  GROUNDING_LABEL,
  groundingOf,
  paperSummary,
  type Grounding,
  marksLabel,
  oldCode,
  paperLabel,
  paperQuestions,
  stems,
  topicQuestions,
  type PastPaper,
  type PastQuestion,
  type QuestionTopic,
} from "@/lib/past/map";
import type { CitationInfo } from "@/lib/study/format";
import { courseName } from "@/lib/study/course-code";
import type { CourseItem, TopicItem } from "@/lib/study/types";
import { Answer } from "./answer";
import { PaperViewer } from "./paper-viewer";
import type { LimitCode } from "@/components/plans/pricing-sheet";
import { LockIcon } from "@/components/plans/icons";

interface PastData {
  /** PRD F12: Free practises its free question(s) per course; Finals everything. */
  access: { plan: "free" | "finals"; freeQuestions: string[]; freeLimit: number };
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
  /** Opened from a "Practise 2025/26 exam" button in the Topics panel: practise this paper. */
  paperId?: string | null;
  onBack: (() => void) | null;
  onCite(slideKey: string): void;
  onRemaining(remaining: number): void;
  /** A Finals-only part was tapped: open the pricing sheet. */
  onLimit(code: LimitCode, resetsAt: string | null): void;
  partnerName: string;
}

const cache = new Map<string, Promise<PastData>>();
function loadPast(courseId: string): Promise<PastData> {
  if (!cache.has(courseId)) {
    const p = fetch(`/api/past?course=${courseId}`).then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw Object.assign(new Error(body?.error ?? "Couldn't load past questions."), { code: body?.code as string | undefined });
      }
      const d = (await r.json()) as PastData & { locked?: boolean };
      if (d.locked) throw Object.assign(new Error("Past questions come with Finals."), { code: "past" });
      d.papers = d.papers.map((x) => ({ ...x, total_marks: x.total_marks == null ? null : Number(x.total_marks) }));
      return d;
    });
    p.catch(() => cache.delete(courseId));
    cache.set(courseId, p);
  }
  return cache.get(courseId)!;
}

export function PastPanel({ course, topics, topicId, paperId = null, onBack, onCite, onRemaining, onLimit, partnerName }: Props) {
  const [data, setData] = useState<PastData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false); // Free: past questions are Finals only (server says 403 "past")
  const [selection, setSelection] = useState<Selection | null>(
    paperId ? { kind: "paper", id: paperId } : topicId ? { kind: "topic", id: topicId } : null,
  );

  useEffect(() => {
    let live = true;
    loadPast(course.id).then(
      (d) => live && setData(d),
      (e: Error & { code?: string }) => {
        if (!live) return;
        if (e.code === "past") setLocked(true);
        else setError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [course.id]);

  const practise = (s: Selection) => setSelection(s);

  // The original paper beside the questions: the paper being practised, the current question's
  // paper (topic practice), or the latest paper (picker).
  const [questionPaper, setQuestionPaper] = useState<string | null>(null);
  const [hasPages, setHasPages] = useState(true);
  const onPaperReady = useCallback((ok: boolean) => setHasPages(ok), []);
  const latest = useMemo(() => (data ? newestFirst(data.papers)[0] ?? null : null), [data]);
  const viewing =
    selection?.kind === "paper"
      ? selection.id
      : selection?.kind === "topic"
        ? questionPaper ?? latest?.id ?? null
        : latest?.id ?? null;
  const viewingPaper = data?.papers.find((p) => p.id === viewing) ?? null;
  const showPaper = !locked && !error && !!data && !!viewingPaper;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-3 pt-1">
        {onBack && (
          // A navy pill, like the site's other main buttons (owner, 21 Nov 2026).
          <button
            type="button"
            onClick={onBack}
            className="mr-1 flex items-center gap-1.5 rounded-full bg-navy py-1.5 pl-3 pr-4 text-[13px] font-medium text-white transition hover:opacity-90 active:scale-95"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Back to chat
          </button>
        )}
        {data && data.papers.length > 0 && <p className="w-full text-[12.5px] text-muted sm:ml-2 sm:w-auto">{paperSummary(data.papers)}</p>}
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${showPaper && hasPages ? "lg:flex-row lg:gap-5 lg:pl-5" : ""}`}>
      {showPaper && (
        <div className={`${hasPages ? "h-[38dvh] shrink-0 px-5 pb-3 lg:h-auto lg:w-1/2 lg:max-w-[640px] lg:px-0 lg:pb-0" : "hidden"} flex min-h-0 flex-col`}>
          <PaperViewer key={viewingPaper.id} paperId={viewingPaper.id} label={paperLabel(viewingPaper)} onReady={onPaperReady} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        {locked ? (
          <FinalsOnly course={course} onUnlock={() => onLimit("past", null)} />
        ) : error ? (
          <p className="mt-10 text-center text-sm text-muted">{error}</p>
        ) : !data ? (
          <div className="mt-16 grid place-items-center text-muted">
            <Spinner />
          </div>
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
            onLimit={onLimit}
            partnerName={partnerName}
            onPaper={setQuestionPaper}
          />
        ) : (
          <Picker course={course} topics={topics} data={data} onPick={practise} />
        )}
      </div>
      </div>
    </div>
  );
}

/** Newest session first; within a session the exam before tests. */
function newestFirst(papers: PastPaper[]): PastPaper[] {
  return [...papers].sort((a, b) => b.session.localeCompare(a.session) || (a.type === "exam" ? -1 : b.type === "exam" ? 1 : 0));
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
  grounding: Grounding | null;
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
  onLimit(code: LimitCode, resetsAt: string | null): void;
  partnerName: string;
  /** The current question's paper, so the original paper beside it follows along. */
  onPaper?(paperId: string | null): void;
}) {
  const { course, topics, data, selection } = props;
  const [freeUsed, setFreeUsed] = useState<string[]>(data.access.freeQuestions);
  const [refused, setRefused] = useState<string[]>([]); // the server said "Finals only"
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
  // Speak the answer instead of typing it (owner, 17 Nov 2026): the same browser voice typing as
  // the chat box. Words go into the current question's answer; stopped when moving on or marking.
  const qid = list[i]?.id ?? null;
  const dictation = useDictation((text) => qid && setDrafts((d) => ({ ...d, [qid]: text })));
  const go = (n: number) => {
    dictation.stop();
    setI(n);
  };
  const currentPaper = list[i]?.paper_id ?? null;
  const { onPaper } = props;
  useEffect(() => onPaper?.(currentPaper), [onPaper, currentPaper]);

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
  const grounding = groundingOf(q.relevance);
  // Free: the course's free practice question(s) and nothing else (the server checks again).
  const locked = refused.includes(q.id) || (data.access.plan === "free" && !freeUsed.includes(q.id) && freeUsed.length >= data.access.freeLimit);

  const send = async (payload: { answer?: string; reveal?: true }) => {
    setBusy(payload.reveal ? "reveal" : "mark");
    setError(null);
    try {
      const r = await fetch("/api/past/attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_id: q.id, ...payload }) });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        if (typeof body?.remaining === "number") props.onRemaining(body.remaining);
        if (body?.code === "past" || body?.code === "daily_cap" || body?.code === "premium_cap") {
          if (body.code === "past") setRefused((x) => [...x, q.id]);
          props.onLimit(body.code, body.resets_at ?? null);
          return;
        }
        throw new Error(body?.error ?? "Something went wrong. Try again.");
      }
      if (typeof body.remaining === "number") props.onRemaining(body.remaining);
      if (data.access.plan === "free") setFreeUsed((u) => (u.includes(q.id) ? u : [...u, q.id]));
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
          {grounding && (
            <span
              className={`rounded-full px-2 py-0.5 ${grounding === "slides" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" : grounding === "partial" ? "bg-sunken text-ink/70" : "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"}`}
            >
              {GROUNDING_LABEL[grounding]}
            </span>
          )}
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

        {locked && !result ? (
          <div className="mt-5 rounded-2xl bg-sunken/70 p-5 text-center">
            <p className="flex items-center justify-center gap-2 text-[15px] font-medium text-ink">
              <LockIcon /> Practise this with Finals
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">
              Finals unlocks every past question, with answers and marking.
            </p>
            <button type="button" onClick={() => props.onLimit("past", null)} className="cta-shine mt-4 rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-brand-ink transition hover:opacity-95">
              Lock in Finals
            </button>
          </div>
        ) : q.type === "mcq" && q.options ? (
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
              <div className="relative">
                <textarea
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                  placeholder={dictation.supported ? "Write or speak your answer as you would in the exam…" : "Write your answer as you would in the exam…"}
                  aria-label="Your answer"
                  rows={7}
                  className="w-full resize-y rounded-xl bg-sunken/60 px-4 py-3 pr-14 text-[15px] text-ink outline-none ring-1 ring-transparent placeholder:text-muted focus:ring-navy/40"
                />
                {dictation.supported && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => (dictation.listening ? dictation.stop() : dictation.start(draft))}
                    aria-label={dictation.listening ? "Stop voice typing" : "Speak your answer"}
                    aria-pressed={dictation.listening}
                    title={dictation.listening ? "Stop" : "Speak your answer"}
                    className={`absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full transition active:scale-90 disabled:opacity-40 ${
                      dictation.listening ? "mic-live bg-red-500 text-white" : "bg-card text-ink/70 ring-1 ring-line hover:text-ink"
                    }`}
                  >
                    {dictation.listening ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                        <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                        <rect x="7" y="2.5" width="6" height="10" rx="3" />
                        <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {dictation.error ? (
                <p role="alert" className="mt-1.5 text-[12px] text-red-700 dark:text-red-400">{dictation.error}</p>
              ) : dictation.listening ? (
                <p role="status" className="mt-1.5 text-[12px] text-ink">Listening… tap the red button when you&apos;re done, then check your answer.</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!draft.trim() || !!busy}
                  onClick={() => {
                    dictation.stop();
                    void send({ answer: draft });
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm text-white transition enabled:hover:opacity-90 enabled:active:scale-95 disabled:opacity-40"
                >
                  {busy === "mark" && <Spinner />}
                  {busy === "mark" ? "Marking…" : "Mark my answer"}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    dictation.stop();
                    void send({ reveal: true });
                  }}
                  className="rounded-full px-4 py-2.5 text-sm text-ink ring-1 ring-line-strong transition hover:bg-sunken disabled:opacity-40"
                >
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
        <button type="button" disabled={i === 0} onClick={() => go(i - 1)} className="rounded-full px-4 py-2 text-sm text-muted transition hover:bg-sunken hover:text-ink disabled:invisible">
          ← Previous
        </button>
        <button type="button" disabled={i >= list.length - 1} onClick={() => go(i + 1)} className="rounded-full bg-sunken px-5 py-2 text-sm text-ink transition hover:bg-pau-100 disabled:invisible">
          Next question →
        </button>
      </div>
    </div>
  );
}

function ResultView({ result, draft, course, onCite, partnerName }: { result: Result; draft: string | null; course: CourseItem; onCite(k: string): void; partnerName: string }) {
  return (
    <div className="mt-5 space-y-4 border-t border-line pt-4">
      {result.grounding === "general" && (
        <p role="note" className="rounded-xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-800">
          {GENERAL_NOTICE}
        </p>
      )}
      {result.grounding === "partial" && (
        <p role="note" className="text-[13px] text-muted">Partly from your slides: the cited parts are from them; the rest is general knowledge.</p>
      )}
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
        <Answer text={result.explanation} citations={result.citations} fallback={null} topicTitle={null} courseName={courseName(course)} courseId={course.id} sortOrder={course.sort_order} onCite={onCite} partnerName={partnerName} />
      ) : (
        result.model_answer && (
          <div>
            <h4 className="mb-2 text-[13px] text-muted">Model answer</h4>
            <Answer text={result.model_answer} citations={result.citations} fallback={null} topicTitle={null} courseName={courseName(course)} courseId={course.id} sortOrder={course.sort_order} onCite={onCite} partnerName={partnerName} />
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
      <ReactMarkdown remarkPlugins={MATH_REMARK} rehypePlugins={MATH_REHYPE}>{text}</ReactMarkdown>
    </div>
  );
}

/** Free: past questions are Finals only. A calm card in the panel, with the way to Finals. */
function FinalsOnly({ course, onUnlock }: { course: CourseItem; onUnlock(): void }) {
  return (
    <div className="mx-auto mt-14 max-w-md rounded-[28px] bg-sunken/70 px-6 py-9 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-navy text-white">
        <LockIcon />
      </span>
      <h2 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-ink">Past questions come with Finals</h2>
      <p className="mx-auto mt-2 max-w-sm text-[15px] text-muted">
        The real PAU past papers for {courseName(course)}, with answers and marked practice.
      </p>
      <button type="button" onClick={onUnlock} className="cta-shine mt-6 rounded-full bg-brand px-7 py-3 text-[15px] font-medium text-brand-ink transition hover:opacity-95 active:scale-[0.98]">
        Lock in Finals
      </button>
    </div>
  );
}
