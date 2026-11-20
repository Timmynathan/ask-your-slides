import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatPage } from "@/components/chat/chat-page";
import { ContentSkeleton } from "@/components/nav/content-skeleton";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";

export const metadata: Metadata = { title: "Chat · Ask Your Slides" };

// Chat from the sidebar (owner, 21 Nov 2026): the general chat on its own page, on every screen size
// (the dashboard's chat column is wide screens only). Same chat as the dashboard: questions go to the
// student's best-matching course (/api/chat/general).
async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded, study_partner, programme").eq("id", user.id).single();
  if (!profile?.onboarded || !isPartnerId(profile.study_partner) || !profile.programme) redirect("/welcome");
  return <ChatPage partner={profile.study_partner} firstName={profile.display_name?.trim().split(/\s+/)[0] ?? null} />;
}

export default function ChatRoute() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
