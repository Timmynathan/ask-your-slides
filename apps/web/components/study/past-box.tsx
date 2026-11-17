"use client";

// Past questions at the top of the Topics panel (PRD F10), where "Search the web" used to be (owner,
// 14 Nov 2026: the web box only linked to chatbots students already have). A bright white card on the
// navy panel, one button per real paper ("Practise 2025/26 exam") so students see exact years, and
// a link to all past questions.
import type { WorkspaceData } from "@/lib/study/types";

const SHOWN = 3;

interface Props {
  papers: WorkspaceData["past"]["papers"];
  total: number;
  active: boolean;
  onOpenPaper(id: string): void;
  onOpenMap(): void;
}

export function PastBox({ papers, total, active, onOpenPaper, onOpenMap }: Props) {
  if (!papers.length) {
    return (
      <div className="rounded-[22px] border border-white/15 px-4 py-3.5 text-white/70">
        <p className="flex items-center gap-2 text-[14px] font-medium text-white">
          <PaperIcon /> Past questions
        </p>
        <p className="mt-1 text-[12.5px] leading-snug">No past papers for this course yet. We add them as we get them.</p>
      </div>
    );
  }
  const shown = papers.slice(0, SHOWN);
  return (
    <section
      aria-label="Past questions"
      className={`rounded-[22px] bg-white p-3.5 text-[#0e1664] shadow-lg shadow-black/20 ring-2 transition ${active ? "ring-[#5ea3ed]" : "ring-transparent"}`}
    >
      <div className="flex items-center gap-2.5 px-0.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0e1664] text-white">
          <PaperIcon />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">Past questions</h2>
          <p className="text-[12px] text-[#0e1664]/65">
            {total} question{total === 1 ? "" : "s"} from real PAU papers
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {shown.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpenPaper(p.id)}
              className={`group flex w-full items-center justify-between gap-2 rounded-full bg-[#0e1664] px-4 py-2.5 text-left text-[13.5px] font-medium text-white transition hover:bg-[#2a3591] active:scale-[0.98] ${i === 0 ? "cta-shine" : ""}`}
              title={`${p.questions} question${p.questions === 1 ? "" : "s"}`}
            >
              <span className="truncate">Practise {p.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition group-hover:translate-x-0.5" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpenMap}
        className="mt-2 w-full rounded-full px-3 py-1.5 text-[12.5px] font-medium text-[#2a3591] transition hover:bg-[#0e1664]/5"
      >
        See all past questions
        {papers.length > SHOWN ? ` · ${papers.length} papers` : ""}
      </button>
    </section>
  );
}

function PaperIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12h5M10 15.5h5" />
    </svg>
  );
}
