"use client";

import Link from "next/link";
import { useState } from "react";
import { DeleteAccountDialog } from "@/components/ui/delete-account-dialog";
import { SignOutButton } from "@/components/ui/sign-out-button";
import type { PlanId } from "@/lib/plans/config";
import { PageFrame } from "./page-frame";
import type { ShellData } from "@/lib/nav/shell-data";

// Settings: your plan, sign out, and (last, quiet) delete account.
export function SettingsView({ email, plan, onLeaderboard }: { email: string; plan: { id: PlanId; name: string; endsAt: string | null }; shell: ShellData; onLeaderboard: boolean }) {
  const [deleting, setDeleting] = useState(false);
  // "Show me on the leaderboard" (owner, 22 Nov 2026): saved as soon as it is flipped.
  const [shown, setShown] = useState(onLeaderboard);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  async function toggleBoard() {
    const next = !shown;
    setShown(next);
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ show_on_leaderboard: next }) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setShown(!next);
      setSaveError("Couldn't save. Try again.");
    }
  }
  const card = "mt-4 rounded-[22px] bg-card p-6 ring-1 ring-line";
  return (
    <PageFrame title="Settings">
      <section className={`${card} mt-6`}>
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">Your plan</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-heading text-[22px] text-ink">{plan.name}</p>
            <p className="text-[14px] text-muted">{plan.id === "finals" && plan.endsAt ? `Active until ${plan.endsAt}` : "A few questions a day on each course"}</p>
          </div>
          {plan.id === "free" ? (
            <Link href="/pricing" className="rounded-full bg-[#BBEEF0] px-5 py-2.5 text-[14.5px] font-semibold text-brand ring-1 ring-[#8fdde1] transition hover:bg-[#a5e7ea]">
              Upgrade
            </Link>
          ) : (
            <Link href="/pricing" className="rounded-full px-5 py-2.5 text-[14.5px] text-ink ring-1 ring-line-strong transition hover:bg-sunken">
              Plans and pricing
            </Link>
          )}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">Leaderboard</h2>
        <div className="mt-2 flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] text-ink">Show me on the leaderboard</p>
            <p className="text-[13.5px] text-muted">Your first name, programme and study streak. Turn it off to hide from other students.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={shown}
            aria-label="Show me on the leaderboard"
            onClick={toggleBoard}
            disabled={saving}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-70 ${shown ? "bg-brand" : "bg-line-strong"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${shown ? "left-6" : "left-1"}`} />
          </button>
        </div>
        {saveError && <p role="alert" className="mt-2 text-[13.5px] text-red-700">{saveError}</p>}
      </section>

      <section className={card}>
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">Account</h2>
        <p className="mt-2 text-[15px] text-ink">{email}</p>
        <div className="mt-4">
          <SignOutButton className="rounded-full px-5 py-2.5 text-[14.5px] text-ink ring-1 ring-line-strong transition hover:bg-sunken" />
        </div>
      </section>

      <section className="mt-10 px-1">
        <button type="button" onClick={() => setDeleting(true)} className="text-[14px] text-red-700 underline-offset-4 hover:underline">
          Delete account
        </button>
        <p className="mt-1 text-[13px] text-muted">Removes your account, chats and uploads for good.</p>
      </section>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </PageFrame>
  );
}
