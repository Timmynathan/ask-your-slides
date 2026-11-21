import type { ReactNode } from "react";
import { ShellMenuButton } from "@/components/nav/app-shell";

// The frame of Your profile and Settings (inside the shared sidebar layout): the title and the
// content. No back link (owner, 21 Nov 2026): the sidebar has Dashboard.
export function PageFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
    <div className="min-h-dvh bg-page">
      {/* Phones have no sidebar: the menu button opens it as a drawer. */}
      <div className="px-2 pt-3 md:hidden">
        <ShellMenuButton />
      </div>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4 sm:px-6 md:pt-10">
        <h1 className="font-heading text-[30px] text-ink">{title}</h1>
        {children}
      </main>
    </div>
    </>
  );
}
