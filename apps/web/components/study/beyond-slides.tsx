// The box for anything the study partner adds that isn't on the slides (an explanation in their own
// words, an extra example, background). Clearly separate from the cited slide content, but framed as
// a bonus, not a warning: students should see it can explain beyond the slides, like any AI chat.
// Used by the real chat (components/study/answer.tsx) and the landing demo, so they match.

export const BEYOND_BOX =
  "rounded-xl border border-pau-100 bg-pau-50/70 px-4 py-3 text-ink dark:border-pau-800/60 dark:bg-pau-900/30";

export function BeyondSlidesLabel({ name, className = "" }: { name: string; className?: string }) {
  return (
    <p className={`mb-1.5 flex flex-wrap items-center gap-x-1.5 text-xs font-semibold text-brand dark:text-[#5ea3ed] ${className}`}>
      <svg width="14" height="14" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <path d="M14 4.5Q15.4 15.6 26.5 17Q15.4 18.4 14 29.5Q12.6 18.4 1.5 17Q12.6 15.6 14 4.5Z" fill="currentColor" />
        <path d="M26 1.5Q26.6 5.4 30.5 6Q26.6 6.6 26 10.5Q25.4 6.6 21.5 6Q25.4 5.4 26 1.5Z" fill="currentColor" />
      </svg>
      {name}&apos;s explanation
      <span className="font-normal text-muted">· beyond your slides</span>
    </p>
  );
}
