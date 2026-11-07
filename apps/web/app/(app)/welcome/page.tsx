import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding/onboarding";
import { requireUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { isPartnerId } from "@/lib/partners";

export const metadata: Metadata = { title: "Welcome · Ask Your Slides" };

async function Loaded({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: courses }] = await Promise.all([
    supabase.from("profiles").select("display_name, onboarded, study_partner").eq("id", user.id).single(),
    supabase.from("courses").select("department"),
  ]);
  // One department → the partner can name it ("I know Computer Science can be hard"). Several
  // (once more departments are added and students choose theirs) → a neutral "your courses".
  const departments = [...new Set((courses ?? []).map((c) => c.department as string))];
  if (profile?.onboarded && isPartnerId(profile.study_partner)) redirect(next ?? "/dashboard");
  return (
    <Onboarding
      department={departments.length === 1 ? departments[0] : null}
      next={next}
      initialName={profile?.display_name ?? ""}
      initialPartner={isPartnerId(profile?.study_partner) ? profile.study_partner : null}
      // Students who signed up before partners existed only need to choose one.
      startAtPartner={!!profile?.onboarded}
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
