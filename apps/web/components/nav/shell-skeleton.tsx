"use client";

// First load only, before the sidebar's data arrives: the sidebar as quiet blocks. Only a course page
// has the wide panel; everywhere else it is just the slim rail, so the dashboard never starts wide and
// then snaps thin (owner, 22 Nov 2026).
// The address is read from the browser (usePathname isn't allowed in a build-time fallback); the
// server's version is the slim rail.
import { useSyncExternalStore } from "react";
import { ContentSkeleton } from "./content-skeleton";

const noop = () => () => {};

export function ShellSkeleton() {
  const inCourse = useSyncExternalStore(noop, () => window.location.pathname.startsWith("/study"), () => false);
  return (
    <div className="min-h-dvh bg-page">
      <div className="fixed inset-y-0 left-0 hidden md:flex" aria-hidden>
        <div className="w-16 bg-pau-900" />
        {inCourse && <div className="w-[252px] bg-navy" />}
      </div>
      <div className={inCourse ? "md:pl-[316px]" : "md:pl-16"}>
        <ContentSkeleton />
      </div>
    </div>
  );
}
