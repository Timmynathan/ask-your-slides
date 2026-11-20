import Link from "next/link";
import type { ReactNode } from "react";

// The frame of Your profile and Settings (inside the shared sidebar layout): a back link to My
// courses, the title, and the content.
export function PageFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
    <div className="min-h-dvh bg-page">
      <header className="mx-auto flex max-w-2xl items-center px-4 pt-5 sm:px-6">
        <Link href="/dashboard" className="-ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[14px] text-ink transition hover:bg-sunken">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          My courses
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4 sm:px-6">
        <h1 className="font-heading text-[30px] text-ink">{title}</h1>
        {children}
      </main>
    </div>
    </>
  );
}
