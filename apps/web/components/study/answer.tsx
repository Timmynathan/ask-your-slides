"use client";

import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  chipLabel,
  chipParts,
  citeKey,
  courseColour,
  displayCode,
  isCiteHref,
  markersToLinks,
  splitAnswer,
  type CitationInfo,
} from "@/lib/study/format";

interface Props {
  text: string;
  citations: CitationInfo[];
  fallback: { topic: string; used: boolean } | null;
  topicTitle: string | null;
  courseCode: string;
  sortOrder: number;
  onCite(slideKey: string): void;
}

export const Answer = memo(function Answer({ text, citations, fallback, topicTitle, courseCode, sortOrder, onCite }: Props) {
  const byKey = new Map(citations.map((c) => [c.slide_key, c]));
  const segments = splitAnswer(text);
  // The label comes from the server (citations outside the topic), not from the model's wording.
  const usedOtherTopics = !!topicTitle && (fallback?.used ?? citations.some((c) => c.outside_topic));

  const components: Components = {
    a({ href, children }) {
      if (isCiteHref(href)) {
        const key = citeKey(href);
        const info = byKey.get(key) ?? { slide_key: key };
        const label = chipLabel(info, { showTopic: !!topicTitle });
        const parts = chipParts(info, { showTopic: !!topicTitle });
        return (
          <button
            type="button"
            onClick={() => onCite(key)}
            title={`Open ${label}`}
            className={`mx-0.5 inline-flex max-w-[20rem] translate-y-[-1px] items-center rounded-full px-2 py-px align-middle text-[11.5px] font-medium ring-1 ring-inset transition-colors ${courseColour(sortOrder)}`}
          >
            {parts.title && <span className="min-w-0 truncate">{parts.title}</span>}
            <span className="shrink-0 whitespace-pre">{parts.title ? " · " : ""}{parts.unit}</span>
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className="my-3 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    h1: ({ children }) => <h3 className="mb-2 mt-5 font-semibold first:mt-0">{children}</h3>,
    h2: ({ children }) => <h3 className="mb-2 mt-5 font-semibold first:mt-0">{children}</h3>,
    h3: ({ children }) => <h4 className="mb-1.5 mt-4 font-semibold first:mt-0">{children}</h4>,
    code: ({ children }) => <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[13px] dark:bg-neutral-800">{children}</code>,
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-lg bg-neutral-100 p-3 font-mono text-[13px] leading-relaxed dark:bg-neutral-900 [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-neutral-300 px-2 py-1.5 text-left font-semibold dark:border-neutral-700">{children}</th>,
    td: ({ children }) => <td className="border-b border-neutral-200 px-2 py-1.5 align-top dark:border-neutral-800">{children}</td>,
  };

  const md = (s: string): ReactNode => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {markersToLinks(s)}
    </ReactMarkdown>
  );

  return (
    <div className="text-[15px] text-neutral-900 dark:text-neutral-100">
      {usedOtherTopics && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Not in <em className="not-italic font-medium">{topicTitle}</em>: from elsewhere in {displayCode(courseCode)}
          </span>
        </p>
      )}
      {segments.map((seg, i) =>
        seg.kind === "general" ? (
          <aside
            key={i}
            className="my-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-neutral-800 first:mt-0 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-neutral-200"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <circle cx="8" cy="8" r="6.25" />
                <path d="M8 7.25V11M8 5v.01" strokeLinecap="round" />
              </svg>
              Not from your slides — general knowledge
            </p>
            {md(seg.text)}
          </aside>
        ) : (
          <div key={i}>{md(seg.text)}</div>
        ),
      )}
    </div>
  );
});
