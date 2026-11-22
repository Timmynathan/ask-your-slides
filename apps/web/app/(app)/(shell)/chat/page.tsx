import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ContentSkeleton } from "@/components/nav/content-skeleton";
import { AskView } from "@/components/chat/ask-view";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { myCourses } from "@/lib/study/my-courses";

export const metadata: Metadata = { title: "Ask anything · Ask Your Slides" };

// "Ask anything" (owner, 22 Nov 2026), from the chat icon in the sidebar: one box for a question when
// the student isn't sure which course it belongs to. It is a doorway, not a second chat: the question
// is matched to the right course and opens in that course's chat (components/dashboard/ask-box.tsx),
// so every conversation still lives in exactly one course. Typing a course's code or name opens it.
// Under it, four general question chips (components/chat/ask-view.tsx) that ask which course first.
async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded, study_partner, level").eq("id", user.id).single();
  if (!profile?.onboarded || !isPartnerId(profile.study_partner)) redirect("/welcome");
  const courses = await myCourses(supabase, profile.level ?? null);

  return (
    <AskView
      partner={profile.study_partner}
      account={user.id}
      courses={courses.map((c) => ({ code: c.code, shownCode: c.shownCode, title: c.title, href: c.href }))}
    />
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
