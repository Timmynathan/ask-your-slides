// Minimal line icons for course cards: one weight, round caps, black (off-white in dark mode),
// drawn on a 24px grid to sit with the sparkle logo. Chosen by lib/study/course-icon.ts.
import { courseIconId, type CourseIconId } from "@/lib/study/course-icon";

const PATHS: Record<CourseIconId, React.ReactNode> = {
  scales: <path d="M12 4v16M8 20h8M5 7h14M7 7l-3 6a3 3 0 0 0 6 0L7 7Zm10 0-3 6a3 3 0 0 0 6 0l-3-6Z" />,
  pen: <path d="M14.5 5.5l4 4M4 20l1-4.5L15.5 5a2 2 0 0 1 3 0l.5.5a2 2 0 0 1 0 3L8.5 19 4 20Z" />,
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </>
  ),
  signal: <path d="M12 13v7M8.5 9.5a5 5 0 0 1 7 0M5.5 6.5a9 9 0 0 1 13 0M12 13a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.2 2.2 3.3 4.9 3.3 8s-1.1 5.8-3.3 8c-2.2-2.2-3.3-4.9-3.3-8S9.8 6.2 12 4Z" />
    </>
  ),
  checklist: <path d="M10 7h9M10 12h9M10 17h9M4.5 7l1 1 2-2M4.5 12l1 1 2-2M4.5 17l1 1 2-2" />,
  code: <path d="M8.5 7.5 4 12l4.5 4.5M15.5 7.5 20 12l-4.5 4.5M13.5 5l-3 14" />,
  spark: <path d="M12 3.5c.6 4.6 3.9 7.9 8.5 8.5-4.6.6-7.9 3.9-8.5 8.5-.6-4.6-3.9-7.9-8.5-8.5 4.6-.6 7.9-3.9 8.5-8.5Z" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  ruler: <path d="M4 16.5 16.5 4 20 7.5 7.5 20 4 16.5ZM8 12.5l1.5 1.5M10.5 10l2 2M13 7.5l1.5 1.5" />,
  palette: <path d="M12 4a8 8 0 1 0 0 16c1.1 0 1.5-.8 1.2-1.6-.4-1-.1-2.4 1.6-2.4H17a3 3 0 0 0 3-3c0-5-3.6-9-8-9ZM8 11h.01M11 7.5h.01M15.5 8.5h.01" />,
  book: <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5v-14ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 8h6" />,
};

export function CourseIcon({ title, size = 32, className = "", light = false }: { title: string; size?: number; className?: string; light?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${light ? "text-white" : "text-black dark:text-[#faf9f5]"} ${className}`}
    >
      {PATHS[courseIconId(title)]}
    </svg>
  );
}
