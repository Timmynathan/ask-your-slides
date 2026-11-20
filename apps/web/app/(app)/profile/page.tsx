import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProfileForm } from "@/components/account/profile-form";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { programmeChoices } from "@/lib/programmes";

export const metadata: Metadata = { title: "Your profile · Ask Your Slides" };

// Your profile (owner, 20 Nov 2026): name, email, programme and level, and study partner, all on one
// page and editable together (replaces "Change study partner" / "Change programme" in the menu).
async function Loaded() {
  const { supabase, user } = await requireUser();
  const [{ data: profile, error }, choices] = await Promise.all([
    supabase.from("profiles").select("display_name, onboarded, study_partner, programme, level").eq("id", user.id).single(),
    programmeChoices(supabase),
  ]);
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner) || !profile.programme) redirect("/welcome");
  return (
    <ProfileForm
      email={user.email ?? ""}
      choices={choices}
      initial={{ name: profile.display_name ?? "", programme: profile.programme, level: profile.level, partner: profile.study_partner }}
    />
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded />
    </Suspense>
  );
}
