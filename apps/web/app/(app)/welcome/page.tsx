import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SaveButtons } from "@/components/ui/form-buttons";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Welcome · PAU Study Assistant" };

async function saveName(form: FormData) {
  "use server";
  const { supabase, user } = await requireUser();
  const raw = String(form.get("display_name") ?? "").trim().slice(0, 60);
  await supabase
    .from("profiles")
    .update({ display_name: form.get("skip") ? null : raw || null, onboarded: true })
    .eq("id", user.id);
  redirect("/dashboard");
}

async function WelcomeForm() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded").eq("id", user.id).single();
  if (profile?.onboarded) redirect("/dashboard");
  return (
    <form action={saveName} className="mt-6">
      <label htmlFor="display_name" className="text-sm font-medium">
        What should we call you? <span className="font-normal text-neutral-500">(optional)</span>
      </label>
      <input id="display_name" name="display_name" maxLength={60} autoComplete="given-name"
        defaultValue={profile?.display_name ?? ""}
        className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900" />
      <SaveButtons label="Continue" busyLabel="Saving…" skipLabel="Skip" />
    </form>
  );
}

export default function WelcomePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-neutral-500">Loading…</p>}>
        <WelcomeForm />
      </Suspense>
    </main>
  );
}
