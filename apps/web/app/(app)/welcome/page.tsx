import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding/onboarding";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";

export const metadata: Metadata = { title: "Welcome · Ask Your Slides" };

async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded, study_partner").eq("id", user.id).single();
  if (profile?.onboarded && isPartnerId(profile.study_partner)) redirect("/dashboard");
  return (
    <Onboarding
      initialName={profile?.display_name ?? ""}
      initialPartner={isPartnerId(profile?.study_partner) ? profile.study_partner : null}
      // Students who signed up before partners existed only need to choose one.
      startAtPartner={!!profile?.onboarded}
    />
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Loaded />
    </Suspense>
  );
}
