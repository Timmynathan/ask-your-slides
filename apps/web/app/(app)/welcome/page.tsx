import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding/onboarding";
import { requireUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { isPartnerId } from "@/lib/partners";
import { programmeChoices } from "@/lib/programmes";

export const metadata: Metadata = { title: "Welcome · Ask Your Slides" };

async function Loaded({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const { supabase, user } = await requireUser();
  const [{ data: profile, error: profileError }, choices] = await Promise.all([
    supabase.from("profiles").select("display_name, onboarded, study_partner, programme, level").eq("id", user.id).single(),
    programmeChoices(supabase),
  ]);
  if (profileError) throw new Error(`Couldn't load your profile: ${profileError.message}`);
  if (profile?.onboarded && isPartnerId(profile.study_partner) && profile.programme) redirect(next ?? "/dashboard");
  return (
    <Onboarding
      choices={choices}
      next={next}
      initialName={profile?.display_name ?? ""}
      initialProgramme={profile?.programme && profile.level ? { programme: profile.programme, level: profile.level } : null}
      initialPartner={isPartnerId(profile?.study_partner) ? profile.study_partner : null}
      // Students who signed up before partners existed only need to choose one.
      startAtPartner={!!profile?.onboarded && !!profile.programme}
    />
  );
}

export default function WelcomePage(props: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
