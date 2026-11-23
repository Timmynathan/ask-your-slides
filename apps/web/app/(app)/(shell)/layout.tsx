import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/nav/app-shell";
import { DeviceBeacon } from "@/components/nav/device-beacon";
import { ShellSkeleton } from "@/components/nav/shell-skeleton";
import { requireUser } from "@/lib/auth/session";
import { shellData } from "@/lib/nav/shell-data";

// The sidebar for My courses, Chat, Past questions, Plans and pricing, Settings and Your profile (owner,
// 21 Nov 2026): one shared layout, so moving between these pages keeps the sidebar in place and only
// the content changes (no blank screen). router.refresh() (e.g. after an upload) updates it too.
async function Shell({ children }: { children: ReactNode }) {
  const { supabase, user } = await requireUser();
  const shell = await shellData(supabase, user);
  return (
    <AppShell title={shell.title} courses={shell.courses} recent={shell.recent} user={shell.user}>
      <DeviceBeacon />
      {children}
    </AppShell>
  );
}

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
