"use client";

import { memo, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "katex/dist/katex.min.css";
import ReactMarkdown, { type Components } from "react-markdown";
import { Diagram } from "./diagram";
import { MATH_REHYPE, MATH_REMARK } from "@/lib/study/math";
import {
  chipLabel,
  chipParts,
  citeKey,
  isCiteHref,
  markersToLinks,
  splitAnswer,
  splitReveal,
  type CitationInfo,
} from "@/lib/study/format";
import { BEYOND_BOX, BeyondSlidesLabel } from "./beyond-slides";
import { prefetchSlide } from "@/lib/study/slide-cache";

interface Props {
  text: string;
  citations: CitationInfo[];
  fallback: { topic: string; used: boolean } | null;
  topicTitle: string | null;
  /** "CSC 402", or the title when the code is a placeholder. */
  courseName: string;
  /** Slide keys are unique within a course; the viewer needs both. */
  courseId: string;
  sortOrder: number;
  onCite(slideKey: string): void;
  /** Study partner's name, for the "beyond your slides" box. */
  partnerName?: string;
}

export const Answer = memo(function Answer({ text, citations, fallback, topicTitle, courseName, courseId, onCite, partnerName = "Your study partner" }: Props) {
  const byKey = new Map(citations.map((c) => [c.slide_key, c]));
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
            onPointerEnter={() => prefetchSlide(courseId, key)}
            onPointerDown={() => prefetchSlide(courseId, key)}
            onFocus={() => prefetchSlide(courseId, key)}
            title={`Open ${label}`}
            className="mx-0.5 inline-flex max-w-[20rem] translate-y-[-1px] items-center rounded-full bg-sunken px-2 py-px align-middle text-[11.5px] text-ink/70 transition-colors hover:bg-pau-100 hover:text-brand"
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
    code: ({ children }) => <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[13px]">{children}</code>,
    pre: ({ children }) => {
      // A ```mermaid block is a diagram to draw (owner, 22 Nov 2026), not code to show.
      const child = (Array.isArray(children) ? children[0] : children) as { props?: { className?: string; children?: unknown } } | undefined;
      if (child?.props?.className?.includes("language-mermaid")) return <Diagram code={[child.props.children ?? ""].flat().join("").trim()} />;
      return <PreBlock>{children}</PreBlock>;
    },
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-line-strong px-2 py-1.5 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-line px-2 py-1.5 align-top">{children}</td>,
  };

  const md = (s: string): ReactNode => (
    <ReactMarkdown remarkPlugins={MATH_REMARK} rehypePlugins={MATH_REHYPE} components={components}>
      {markersToLinks(s)}
    </ReactMarkdown>
  );

  const segments = (s: string): ReactNode =>
    splitAnswer(s).map((seg, i) =>
      seg.kind === "general" ? (
        <aside key={i} className={`my-4 first:mt-0 ${BEYOND_BOX}`}>
          <BeyondSlidesLabel name={partnerName} />
          {md(seg.text)}
        </aside>
      ) : (
        <div key={i}>{md(seg.text)}</div>
      ),
    );

  return (
    <div className="text-[15px] text-ink">
      {usedOtherTopics && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-sunken px-2.5 py-1 text-xs text-ink/80">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2 8h11M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Not in <em className="not-italic font-medium">{topicTitle}</em>: from elsewhere in {courseName}
          </span>
        </p>
      )}
      {splitReveal(text).map((part, p) =>
        part.kind === "answer" ? (
          // A practice question's answer, closed until the student opens it (owner, 25 Nov 2026).
          <details key={p} className="group my-3 rounded-xl bg-sunken/60 px-3.5 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 py-0.5 text-[14px] font-medium text-brand [&::-webkit-details-marker]:hidden">
              <ChevronDown size={16} absoluteStrokeWidth strokeWidth={1.6} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
              <span className="group-open:hidden">Show answer</span>
              <span className="hidden group-open:inline">Hide answer</span>
            </summary>
            <div className="pb-1 pt-2">{segments(part.text)}</div>
          </details>
        ) : (
          <div key={p}>{segments(part.text)}</div>
        ),
      )}
    </div>
  );
});

function PreBlock({ children }: { children: ReactNode }) {
  return <pre className="my-3 overflow-x-auto rounded-lg bg-sunken p-3 font-mono text-[13px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0">{children}</pre>;
}
