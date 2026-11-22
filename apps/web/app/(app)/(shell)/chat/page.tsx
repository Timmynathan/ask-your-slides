import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ContentSkeleton } from "@/components/nav/content-skeleton";
import { AskBox } from "@/components/dashboard/ask-box";
import { Mascot } from "@/components/mascot/mascot";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId, PARTNERS } from "@/lib/partners";
import { myCourses } from "@/lib/study/my-courses";

export const metadata: Metadata = { title: "Ask anything · Ask Your Slides" };

// "Ask anything" (owner, 22 Nov 2026), from the chat icon in the sidebar: one box for a question when
// the student isn't sure which course it belongs to. It is a doorway, not a second chat: the question
// is matched to the right course and opens in that course's chat (components/dashboard/ask-box.tsx),
// so every conversation still lives in exactly one course. Typing a course's code or name opens it.
async function Loaded() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded, study_partner, level").eq("id", user.id).single();
  if (!profile?.onboarded || !isPartnerId(profile.study_partner)) redirect("/welcome");
  const courses = await myCourses(supabase, profile.level ?? null);
  const first = (profile.display_name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-2xl flex-col justify-center px-4 pb-16 pt-10 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <Mascot partner={profile.study_partner} size={88} mood="happy" animated={false} />
        <h1 className="mt-5 font-heading text-[28px] font-medium tracking-tight text-ink sm:text-[34px]">
          {first ? `What's on your mind, ${first}?` : "What's on your mind?"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
          Ask in your own words. {PARTNERS[profile.study_partner].name} will find the right course and answer from its slides. You can also type a course to open it.
        </p>
      </div>
      <div className="mt-8">
        <AskBox courses={courses.map((c) => ({ code: c.code, shownCode: c.shownCode, title: c.title, href: c.href }))} />
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
