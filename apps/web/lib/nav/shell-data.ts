import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShellChat, ShellCourse } from "@/components/nav/app-shell";
import { programmeChoices, sidebarTitle } from "@/lib/programmes";
import { myCourses } from "@/lib/study/my-courses";

// What the sidebar needs on pages that aren't the dashboard (Plans and pricing, Settings, Your profile:
// owner, 21 Nov 2026): the programme title, the student's courses (for Upload) and their latest chats.
// Reads run as the student (RLS). Recent chats: the latest 60, for the rail's chat list (owner, 23 Nov
// 2026: like ChatGPT's sidebar), also served fresh by GET /api/conversations/recent.
export interface ShellData {
  title: string;
  courses: ShellCourse[];
  recent: ShellChat[];
  user: { email: string; displayName: string | null };
}

const RECENT_MAX = 60;
const withChat = (href: string, id: string) => `${href}${href.includes("?") ? "&" : "?"}chat=${id}`;

export async function shellData(supabase: SupabaseClient, user: { id: string; email?: string | null }): Promise<ShellData> {
  const { data: profile } = await supabase.from("profiles").select("display_name, programme, level").eq("id", user.id).single();
  const [courses, choices, { data: chats }] = await Promise.all([
    myCourses(supabase, profile?.level ?? null),
    programmeChoices(supabase),
    supabase.from("conversations").select("id, title, course_id, updated_at").order("updated_at", { ascending: false }).limit(RECENT_MAX),
  ]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  return {
    title: sidebarTitle(choices, profile?.programme),
    courses: courses.map((c) => ({ id: c.id, title: c.title, href: c.href })),
    recent: ((chats ?? []) as { id: string; title: string; course_id: string; updated_at: string }[])
      .filter((ch) => byId.has(ch.course_id))
      .map((ch) => {
        const c = byId.get(ch.course_id)!;
        return { id: ch.id, title: ch.title || "New chat", href: withChat(c.href, ch.id), course: c.shownCode ?? c.title, at: ch.updated_at };
      }),
    user: { email: user.email ?? "", displayName: profile?.display_name ?? null },
  };
}
