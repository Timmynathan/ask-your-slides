import { ContentSkeleton } from "@/components/nav/content-skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/account/settings-view";
import { requireUser } from "@/lib/auth/session";
import { planState } from "@/lib/plans/entitlement";
import { PLAN_NAMES } from "@/lib/plans/config";
import { adminClient } from "@/lib/supabase/admin";
import { shellData } from "@/lib/nav/shell-data";

export const metadata: Metadata = { title: "Settings · Ask Your Slides" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });

// Settings (owner, 20 Nov 2026): the student's plan, Sign out, and Delete account (kept here, out of
// the account menu, so it isn't one tap away).
async function Loaded() {
  const { supabase, user } = await requireUser();
  const [state, shell, { data: board }] = await Promise.all([
    planState(adminClient(), user.id, new Date()),
    shellData(supabase, user),
    // Missing until migration 20261122000001 is pushed: then everyone is shown.
    supabase.from("profiles").select("show_on_leaderboard").eq("id", user.id).maybeSingle(),
  ]);
  // Missing until migration 20261124000001 is pushed: then shown as on (the default).
  const { data: mail } = await supabase.from("profiles").select("email_updates").eq("id", user.id).maybeSingle();
  return (
    <SettingsView
      email={user.email ?? ""}
      shell={shell}
      onLeaderboard={(board as { show_on_leaderboard?: boolean } | null)?.show_on_leaderboard ?? true}
      emailUpdates={(mail as { email_updates?: boolean } | null)?.email_updates ?? true}
      plan={{ id: state.plan, name: PLAN_NAMES[state.plan], endsAt: state.endsAt ? day.format(state.endsAt) : null }}
    />
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
