import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Workspace } from "@/components/study/workspace";
import { WorkspaceSkeleton } from "@/components/study/workspace-skeleton";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { PAST_QUESTIONS_LIVE } from "@/lib/past/feature";
import { resolveCourse } from "@/lib/study/course-link";
import type { ChatItem, CourseItem, MaterialItem, TopicItem } from "@/lib/study/types";

export const metadata: Metadata = { title: "Ask Your Slides" };

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ topic?: string; chat?: string; programme?: string; past?: string }>;
};

// Loads every course's topics and all of the student's chats in one go. Switching courses then
// happens in the browser (no server round trip, no blank screen); the URL is kept in sync.
async function Loaded({ params, searchParams }: Props) {
  const [{ code: rawCode }, sp] = await Promise.all([params, searchParams]);
  const code = rawCode.toUpperCase();
  const { supabase, user } = await requireUser();

  const [{ data: courses }, { data: profile, error: profileError }, { data: used }, { data: topicRows }, { data: chats }, { data: materialRows }, { count: questionCount }, { data: pulseRow }, { data: pastRows }, { data: pastTopics }] = await Promise.all([
    supabase.from("courses").select("id, code, programme, department, title, sort_order, elective").order("sort_order"),
    supabase.from("profiles").select("display_name, onboarded, study_partner, department, programme").eq("id", user.id).single(),
    supabase.rpc("my_usage_today"),
    supabase.from("topics").select("id, course_id, topic_order, title, materials(count)").order("topic_order"),
    supabase.from("conversations").select("id, course_id, title, topic_id, updated_at").order("updated_at", { ascending: false }).limit(500),
    // Every programme's course with this code; narrowed to the chosen one below.
    supabase.from("materials").select("id, course_id, topic_id, kind, material_order, title, page_count, source_file, courses!inner(code)").eq("courses.code", code).order("material_order"),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("role", "user"),
    supabase.from("pulse_responses").select("score").maybeSingle(),
    // Past questions (PRD F10): ids only, for the Topics entry and the topic chips; the questions
    // themselves load when the student opens them.
    supabase.from("past_questions").select("id, parent_id, course_id, courses!inner(code)").eq("courses.code", code),
    supabase.from("question_topics").select("question_id, topic_id"),
  ]);
  if (profileError) throw new Error(`Couldn't load your profile: ${profileError.message}`);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner) || !profile.programme) redirect("/welcome");
  // RLS returns only the student's programme + level's courses (PRD F11): another programme's
  // course is simply not found.
  const course = resolveCourse((courses ?? []) as CourseItem[], code, sp.programme, profile.department);
  if (!course) notFound();

  // Topics with no material yet stay in the manifest but aren't shown.
  const topics: TopicItem[] = (topicRows ?? [])
    .filter((t) => ((t.materials as unknown as { count: number }[])[0]?.count ?? 0) > 0)
    .map((t) => ({ id: t.id, course_id: t.course_id, order: t.topic_order, title: t.title }));

  const chatList = (chats ?? []) as ChatItem[];
  const initialChat = sp.chat ? chatList.find((c) => c.id === sp.chat && c.course_id === course.id) ?? null : null;
  const topicFromUrl = sp.topic ? topics.find((t) => t.course_id === course.id && String(t.order) === sp.topic) ?? null : null;
  const past = pastCounts(course.id, (pastRows ?? []) as { id: string; parent_id: string | null; course_id: string }[], pastTopics ?? []);
  const cap = Number(process.env.DAILY_MESSAGE_CAP) > 0 ? Number(process.env.DAILY_MESSAGE_CAP) : 50;

  return (
    <Workspace
      courses={courses as CourseItem[]}
      topics={topics}
      chats={chatList}
      materials={(materialRows ?? []).filter((m) => m.course_id === course.id).map((m) => ({ id: m.id, course_id: m.course_id, topic_id: m.topic_id, kind: m.kind, material_order: m.material_order, title: m.title, page_count: m.page_count, source_file: m.source_file })) as MaterialItem[]}
      initialCourseId={course.id}
      initialTopicId={initialChat ? initialChat.topic_id : topicFromUrl?.id ?? null}
      initialChatId={initialChat?.id ?? null}
      user={{ email: user.email ?? "", displayName: profile?.display_name ?? null }}
      partner={profile.study_partner}
      usage={{ used: (used as number | null) ?? 0, cap }}
      pulse={{ questions: questionCount ?? 0, answered: !!pulseRow }}
      past={past}
      initialPast={sp.past === "1" && (past.total > 0 || !PAST_QUESTIONS_LIVE) && !initialChat}
    />
  );
}

/** Practised past questions (those without parts) of one course, in total and per topic. */
function pastCounts(courseId: string, rows: { id: string; parent_id: string | null; course_id: string }[], qt: { question_id: string; topic_id: string }[]) {
  const mine = rows.filter((r) => r.course_id === courseId);
  const parents = new Set(mine.map((r) => r.parent_id).filter(Boolean));
  const ids = new Set(mine.filter((r) => !parents.has(r.id)).map((r) => r.id));
  const byTopic: Record<string, number> = {};
  for (const { question_id, topic_id } of qt) if (ids.has(question_id)) byTopic[topic_id] = (byTopic[topic_id] ?? 0) + 1;
  return { total: ids.size, byTopic };
}

export default function StudyPage(props: Props) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Loaded {...props} />
    </Suspense>
  );
}
