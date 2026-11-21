import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShellChat, ShellCourse } from "@/components/nav/app-shell";
import { programmeChoices, sidebarTitle } from "@/lib/programmes";
import { myCourses } from "@/lib/study/my-courses";

// What the sidebar needs on pages that aren't the dashboard (Plans and pricing, Settings, Your profile:
// owner, 21 Nov 2026): the programme title, the student's courses (for Upload) and their latest chats.
// Reads run as the student (RLS).
export interface ShellData {
  title: string;
  courses: ShellCourse[];
  recent: ShellChat[];
  user: { email: string; displayName: string | null };
}

const withChat = (href: string, id: string) => `${href}${href.includes("?") ? "&" : "?"}chat=${id}`;

export async function shellData(supabase: SupabaseClient, user: { id: string; email?: string | null }): Promise<ShellData> {
  const { data: profile } = await supabase.from("profiles").select("display_name, programme, level").eq("id", user.id).single();
  const [courses, choices, { data: chats }] = await Promise.all([
    myCourses(supabase, profile?.level ?? null),
    programmeChoices(supabase),
    supabase.from("conversations").select("id, title, course_id").order("updated_at", { ascending: false }).limit(20),
  ]);
  const byId = new Map(courses.map((c) => [c.id, c]));
  return {
    title: sidebarTitle(choices, profile?.programme),
    courses: courses.map((c) => ({ id: c.id, title: c.title, href: c.href })),
    recent: ((chats ?? []) as { id: string; title: string; course_id: string }[])
      .filter((ch) => byId.has(ch.course_id))
      .slice(0, 6)
      .map((ch) => ({ id: ch.id, title: ch.title || "New chat", href: withChat(byId.get(ch.course_id)!.href, ch.id) })),
    user: { email: user.email ?? "", displayName: profile?.display_name ?? null },
  };
}
