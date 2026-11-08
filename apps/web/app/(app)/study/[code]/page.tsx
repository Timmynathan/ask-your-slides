import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Workspace } from "@/components/study/workspace";
import { WorkspaceSkeleton } from "@/components/study/workspace-skeleton";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import type { ChatItem, CourseItem, MaterialItem, TopicItem } from "@/lib/study/types";

export const metadata: Metadata = { title: "Ask Your Slides" };

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ topic?: string; chat?: string }>;
};

// Loads every course's topics and all of the student's chats in one go. Switching courses then
// happens in the browser (no server round trip, no blank screen); the URL is kept in sync.
async function Loaded({ params, searchParams }: Props) {
  const [{ code: rawCode }, sp] = await Promise.all([params, searchParams]);
  const code = rawCode.toUpperCase();
  const { supabase, user } = await requireUser();

  const [{ data: courses }, { data: profile }, { data: used }, { data: topicRows }, { data: chats }, { data: materialRows }] = await Promise.all([
    supabase.from("courses").select("id, code, title, sort_order").order("sort_order"),
    supabase.from("profiles").select("display_name, onboarded, study_partner").eq("id", user.id).single(),
    supabase.rpc("my_usage_today"),
    supabase.from("topics").select("id, course_id, topic_order, title, materials(count)").order("topic_order"),
    supabase.from("conversations").select("id, course_id, title, topic_id, updated_at").order("updated_at", { ascending: false }).limit(500),
    supabase.from("materials").select("id, course_id, topic_id, kind, material_order, title, page_count, courses!inner(code)").eq("courses.code", code).order("material_order"),
  ]);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner)) redirect("/welcome");
  const course = (courses as CourseItem[] | null)?.find((c) => c.code === code);
  if (!course) notFound();

  // Topics with no material yet stay in the manifest but aren't shown.
  const topics: TopicItem[] = (topicRows ?? [])
    .filter((t) => ((t.materials as unknown as { count: number }[])[0]?.count ?? 0) > 0)
    .map((t) => ({ id: t.id, course_id: t.course_id, order: t.topic_order, title: t.title }));

  const chatList = (chats ?? []) as ChatItem[];
  const initialChat = sp.chat ? chatList.find((c) => c.id === sp.chat && c.course_id === course.id) ?? null : null;
  const topicFromUrl = sp.topic ? topics.find((t) => t.course_id === course.id && String(t.order) === sp.topic) ?? null : null;
  const cap = Number(process.env.DAILY_MESSAGE_CAP) > 0 ? Number(process.env.DAILY_MESSAGE_CAP) : 50;

  return (
    <Workspace
      courses={courses as CourseItem[]}
      topics={topics}
      chats={chatList}
      materials={(materialRows ?? []).map((m) => ({ id: m.id, course_id: m.course_id, topic_id: m.topic_id, kind: m.kind, material_order: m.material_order, title: m.title, page_count: m.page_count })) as MaterialItem[]}
      initialCourseId={course.id}
      initialTopicId={initialChat ? initialChat.topic_id : topicFromUrl?.id ?? null}
      initialChatId={initialChat?.id ?? null}
      user={{ email: user.email ?? "", displayName: profile?.display_name ?? null }}
      partner={profile.study_partner}
      usage={{ used: (used as number | null) ?? 0, cap }}
    />
  );
}

export default function StudyPage(props: Props) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Loaded {...props} />
    </Suspense>
  );
}
