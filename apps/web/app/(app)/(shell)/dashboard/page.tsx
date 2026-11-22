import { ContentSkeleton } from "@/components/nav/content-skeleton";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Dashboard, type DashboardCourse } from "@/components/dashboard/dashboard";
import { requireUser } from "@/lib/auth/session";
import { isPartnerId } from "@/lib/partners";
import { countMain, courseName, LIMITED_MAIN_MATERIALS, shownCode } from "@/lib/study/course-code";
import { courseHref } from "@/lib/study/course-link";
import { planState } from "@/lib/plans/entitlement";
import { FinalsWelcome } from "@/components/plans/finals-welcome";
import { EXAMS_START, FINALS_DAILY, FREE_PAST_PROGRAMMES } from "@/lib/plans/config";
import { finalsPrice, lagosDay, limitsFor } from "@/lib/plans/limits";
import { currentStreak } from "@/lib/study/streak";
import { adminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "My courses · Ask Your Slides" };

// Dates are formatted here, in Lagos time, so server and browser render the same text.
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

async function Loaded() {
  const { supabase, user } = await requireUser();
  const [{ data: allCourses }, { data: profile, error: profileError }, { data: chats }, { data: enrolments }, { data: removals }] = await Promise.all([
    supabase.from("courses").select("id, code, code_confirmed, programme, level, title, department, sort_order, elective, premium, materials(kind)").order("sort_order"),
    supabase.from("profiles").select("display_name, onboarded, study_partner, programme, level").eq("id", user.id).single(),
    supabase.from("conversations").select("id, course_id, title, topic_id, updated_at").order("updated_at", { ascending: false }).limit(500),
    // Extra courses the student added (retakes, extras). Missing before the migration: then none.
    supabase.from("course_enrollments").select("course_id"),
    // Own-level courses the student removed (carryovers). Missing before the migration: then none.
    supabase.from("course_removals").select("course_id"),
  ]);
  const removed = new Set(((removals ?? []) as { course_id: string }[]).map((r) => r.course_id));
  const added = new Set(((enrolments ?? []) as { course_id: string }[]).map((r) => r.course_id));
  // A failed read is an error, not "new student": never bounce an onboarded student back to Welcome.
  if (profileError) throw new Error(`Couldn't load your profile: ${profileError.message}`);
  if (!profile?.onboarded || !isPartnerId(profile.study_partner) || !profile.programme) redirect("/welcome");
  // RLS returns only the student's programme + level's courses (PRD F11), plus the courses they added.
  const courses = allCourses ?? [];

  // PRD F12: free questions left today on premium courses (Free students only).
  const db = adminClient();
  const now = new Date();
  const state = await planState(db, user.id, now);
  const today = lagosDay(now);
  const [{ data: daily }, { data: perCourse }] = await Promise.all([
    db.from("usage_daily").select("message_count").eq("user_id", user.id).eq("day", today).maybeSingle(),
    db.from("usage_course_daily").select("course_id, message_count").eq("user_id", user.id).eq("day", today),
  ]);
  const usedToday = (daily as { message_count: number } | null)?.message_count ?? 0;
  const usedIn = new Map(((perCourse ?? []) as { course_id: string; message_count: number }[]).map((r) => [r.course_id, r.message_count]));
  const premiumLeft = (courseId: string, premium: boolean): number | null => {
    const l = limitsFor(state.plan, { createdAt: state.createdAt, now, premium });
    if (l.course === null) return null;
    return Math.max(0, Math.min(l.daily - usedToday, l.course - (usedIn.get(courseId) ?? 0)));
  };

  const chatRows = (chats ?? []) as { id: string; course_id: string; title: string; topic_id: string | null; updated_at: string }[];
  const list: DashboardCourse[] = (courses ?? [])
    .map((c) => {
      const mine = chatRows.filter((ch) => ch.course_id === c.id); // newest first
      // An added course from another level: tagged with its level, listed after the student's own.
      const extraLevel = added.has(c.id as string) && c.level !== profile.level ? (c.level as number) : null;
      return {
        id: c.id as string,
        code: c.code as string,
        href: courseHref(c as { code: string; programme: string }, (allCourses ?? []) as { code: string; programme: string }[]),
        title: c.title as string,
        department: c.department as string,
        elective: !!c.elective,
        sortOrder: (c.sort_order as number) + (extraLevel === null ? 0 : 1_000_000 + (900 - extraLevel) * 1000),
        extraLevel,
        shownCode: shownCode(c as { code: string; code_confirmed: boolean }),
        materials: (c.materials as { kind: string }[]).length,
        limited: countMain(c.materials as { kind: string }[]) < LIMITED_MAIN_MATERIALS,
        premiumLeft: premiumLeft(c.id as string, !!c.premium),
        chats: mine.length,
        lastStudiedAt: mine[0]?.updated_at ?? null,
        lastStudied: mine[0] ? day.format(new Date(mine[0].updated_at)) : null,
      };
    })
    .filter((c) => c.materials > 0) // a course with no material yet has nothing to study
    .filter((c) => c.extraLevel !== null || !removed.has(c.id)); // removed from My courses

  // The dashboard's second speech bubble (owner, 22 Nov 2026): the course of the last chat, and a link
  // straight back into that chat.
  const lastChat = chatRows.find((ch) => list.some((c) => c.id === ch.course_id)) ?? null;
  let lastStudied: { course: string; courseHref: string; chatHref: string } | null = null;
  if (lastChat) {
    const c = (courses ?? []).find((x) => x.id === lastChat.course_id)!;
    const { data: t } = lastChat.topic_id ? await supabase.from("topics").select("topic_order").eq("id", lastChat.topic_id).maybeSingle() : { data: null };
    const all = (allCourses ?? []) as { code: string; programme: string }[];
    const extra: Record<string, string> = t ? { topic: String((t as { topic_order: number }).topic_order) } : {};
    lastStudied = {
      // The code ("CSC 402") keeps the message short enough for one line on laptops (owner, 22 Nov 2026).
      course: courseName(c as { code: string; code_confirmed: boolean; title: string }),
      courseHref: courseHref(c as { code: string; programme: string }, all),
      chatHref: courseHref(c as { code: string; programme: string }, all, { ...extra, chat: lastChat.id }),
    };
  }

  // Recent lectures (owner, 22 Nov 2026): the topics of the latest chats, newest first, each with its
  // first slide as a picture (signed, expiring URL) and a link back into that chat.
  const seenTopics = new Set<string>();
  const recentChats = chatRows.filter((ch) => ch.topic_id && list.some((c) => c.id === ch.course_id) && !seenTopics.has(ch.topic_id) && seenTopics.add(ch.topic_id)).slice(0, 8);
  const recentLectures = await recentLectureCards(supabase, db, recentChats, (courses ?? []) as CourseRow[], (allCourses ?? []) as { code: string; programme: string }[]);

  // Study streak: Lagos days in a row with a question asked, ending today (or yesterday, if today has
  // none yet). The same days as the leaderboard (lib/study/streak.ts).
  const { data: asked } = await db.from("usage_daily").select("day").eq("user_id", user.id).gt("message_count", 0).order("day", { ascending: false }).limit(400);
  const days = new Set(((asked ?? []) as { day: string }[]).map((r) => r.day));
  const streak = currentStreak(days, now);

  return (
    <>
      <Dashboard
        lastStudied={lastStudied}
        recentLectures={recentLectures}
        streak={{ days: streak, today: days.has(today) }}
        examsInDays={Math.max(0, Math.ceil((EXAMS_START.getTime() - now.getTime()) / 86_400_000))}
        price={state.plan === "free" ? finalsPrice(now) : null}
        freePast={FREE_PAST_PROGRAMMES.includes(profile.programme as string)}
        courses={list}
        partner={profile.study_partner}
        onFinals={state.plan !== "free"}
        user={{ id: user.id, email: user.email ?? "", displayName: profile.display_name ?? null }}
      />
      {state.welcome && <FinalsWelcome id={state.welcome.id} endsAt={state.welcome.endsAt} daily={FINALS_DAILY} trial={state.welcome.trial} />}
    </>
  );
}

type CourseRow = { id: string; code: string; programme: string; title: string };

async function recentLectureCards(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  db: ReturnType<typeof adminClient>,
  chats: { id: string; course_id: string; topic_id: string | null }[],
  courses: CourseRow[],
  all: { code: string; programme: string }[],
) {
  if (chats.length === 0) return [];
  const topicIds = chats.map((c) => c.topic_id!) ;
  const [{ data: topics }, { data: mats }] = await Promise.all([
    supabase.from("topics").select("id, topic_order, title").in("id", topicIds),
    supabase.from("materials").select("topic_id, material_order, kind").in("topic_id", topicIds).in("kind", ["slides", "notes"]).order("material_order"),
  ]);
  const firstMat = new Map<string, number>();
  for (const m of (mats ?? []) as { topic_id: string; material_order: number }[]) if (!firstMat.has(m.topic_id)) firstMat.set(m.topic_id, m.material_order);
  const cards = chats.flatMap((ch) => {
    const t = ((topics ?? []) as { id: string; topic_order: number; title: string }[]).find((x) => x.id === ch.topic_id);
    const c = courses.find((x) => x.id === ch.course_id);
    if (!t || !c) return [];
    const order = firstMat.get(t.id);
    return [{
      id: ch.id,
      title: t.title,
      course: c.title,
      href: courseHref(c, all, { topic: String(t.topic_order), chat: ch.id }),
      courseId: c.id,
      slideKey: order === undefined ? null : `${c.code}-${String(order).padStart(2, "0")}-1`,
    }];
  });
  const keys = cards.flatMap((c) => (c.slideKey ? [c.slideKey] : []));
  const { data: slides } = keys.length ? await supabase.from("slides").select("course_id, slide_key, image_path").in("slide_key", keys) : { data: [] };
  const paths = ((slides ?? []) as { course_id: string; slide_key: string; image_path: string | null }[]).filter((s) => s.image_path);
  const { data: signed } = paths.length ? await db.storage.from("slides").createSignedUrls(paths.map((s) => s.image_path!), 60 * 60) : { data: [] };
  return cards.map(({ slideKey, courseId, ...card }) => {
    const row = paths.find((s) => s.slide_key === slideKey && s.course_id === courseId);
    const url = row ? signed?.find((x) => x.path === row.image_path && !x.error)?.signedUrl ?? null : null;
    return { ...card, image: url };
  });
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Loaded />
    </Suspense>
  );
}
