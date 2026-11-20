import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/account/settings-view";
import { requireUser } from "@/lib/auth/session";
import { planState } from "@/lib/plans/entitlement";
import { PLAN_NAMES } from "@/lib/plans/config";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Settings · Ask Your Slides" };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" });

// Settings (owner, 20 Nov 2026): the student's plan, Sign out, and Delete account (kept here, out of
// the account menu, so it isn't one tap away).
async function Loaded() {
  const { user } = await requireUser();
  const state = await planState(adminClient(), user.id, new Date());
  return (
    <SettingsView
      email={user.email ?? ""}
      plan={{ id: state.plan, name: PLAN_NAMES[state.plan], endsAt: state.endsAt ? day.format(state.endsAt) : null }}
    />
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
