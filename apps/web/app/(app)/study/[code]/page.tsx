import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Workspace } from "@/components/study/workspace";
import { requireUser } from "@/lib/auth/session";
import type { ChatItem, CourseItem, TopicItem } from "@/lib/study/types";

export const metadata: Metadata = { title: "PAU Study Assistant" };

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ topic?: string; chat?: string }>;
};

async function Loaded({ params, searchParams }: Props) {
  const [{ code: rawCode }, sp] = await Promise.all([params, searchParams]);
  const code = rawCode.toUpperCase();
  const { supabase, user } = await requireUser();

  const [{ data: courses }, { data: profile }, { data: used }] = await Promise.all([
    supabase.from("courses").select("id, code, title, sort_order").order("sort_order"),
    supabase.from("profiles").select("display_name, onboarded").eq("id", user.id).single(),
    supabase.rpc("my_usage_today"),
  ]);
  if (profile && !profile.onboarded) redirect("/welcome");
  const course = (courses as CourseItem[] | null)?.find((c) => c.code === code);
  if (!course) notFound();

  const [{ data: topicRows }, { data: chats }] = await Promise.all([
    supabase.from("topics").select("id, topic_order, title, materials(count)").eq("course_id", course.id).order("topic_order"),
    supabase
      .from("conversations")
      .select("id, title, topic_id, updated_at")
      .eq("course_id", course.id)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);
  // Topics with no material yet (e.g. a file still to be uploaded) stay in the manifest but
  // aren't shown: a chat there could only ever fall back to the whole course.
  const topics: TopicItem[] = (topicRows ?? [])
    .filter((t) => ((t.materials as unknown as { count: number }[])[0]?.count ?? 0) > 0)
    .map((t) => ({ id: t.id, order: t.topic_order, title: t.title }));

  const chatList = (chats ?? []) as ChatItem[];
  const initialChat = sp.chat ? chatList.find((c) => c.id === sp.chat) ?? null : null;
  const topicFromUrl = sp.topic ? topics.find((t) => String(t.order) === sp.topic) ?? null : null;
  const cap = Number(process.env.DAILY_MESSAGE_CAP) > 0 ? Number(process.env.DAILY_MESSAGE_CAP) : 50;

  return (
    <Workspace
      courses={courses as CourseItem[]}
      course={course}
      topics={topics}
      chats={chatList}
      initialTopicId={initialChat ? initialChat.topic_id : topicFromUrl?.id ?? null}
      initialChatId={initialChat?.id ?? null}
      user={{ email: user.email ?? "", displayName: profile?.display_name ?? null }}
      usage={{ used: (used as number | null) ?? 0, cap }}
    />
  );
}

export default function StudyPage(props: Props) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-neutral-500">Loading…</div>}>
      <Loaded {...props} />
    </Suspense>
  );
}
