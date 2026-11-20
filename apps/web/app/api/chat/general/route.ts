import { NextResponse } from "next/server";
import { z } from "zod";
import { embedQuery } from "@/lib/agent/embed";
import { matchSlides, type SlideHit } from "@/lib/agent/retrieval";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { myCourses } from "@/lib/study/my-courses";
import { POST as courseChat } from "../route";

export const maxDuration = 60;

// The general chat on the dashboard (owner, 20 Nov 2026: "search all my courses"). A first question
// is matched against the slides of every course the student takes; the best-matching course gets a
// new chat, and the question goes through that course's normal chat (/api/chat): same grounding,
// citations, plan limits (a premium course's Free cap applies) and saving. Follow-up questions in the
// panel continue that chat. The chosen course comes back in response headers, so the panel can say
// where the answer is from and link to the chat inside the course.

const Body = z.object({
  message: z.string().trim().min(1, "Type a question first.").max(4000, "That message is too long."),
  message_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
});

/** How many slides to compare per course when choosing where a question belongs. */
const PER_COURSE = 3;

/** A course's fit for the question: the average similarity of its best PER_COURSE slides. One slide
 *  that happens to share a phrase ("why it matters") shouldn't outrank a course whose slides are about
 *  the topic (checked on CSC 400-level questions, 20 Nov 2026). */
function courseFit(hits: SlideHit[]): number {
  const top = hits.map((h) => h.similarity ?? 0).sort((a, b) => b - a).slice(0, PER_COURSE);
  return top.length ? top.reduce((a, b) => a + b, 0) / PER_COURSE : 0;
}

function forward(request: Request, body: object) {
  return courseChat(
    new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify(body),
    }),
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { message, message_id: messageId, conversation_id: conversationId } = parsed.data;

  // A follow-up: the chat (and so the course) is already chosen; RLS checks it's theirs.
  if (conversationId) return forward(request, { conversation_id: conversationId, message, message_id: messageId });

  const { data: profile } = await supabase.from("profiles").select("level").eq("id", auth.user.id).single();
  const courses = await myCourses(supabase, profile?.level ?? null);
  if (courses.length === 0) return NextResponse.json({ error: "You don't have any courses with slides yet." }, { status: 400 });

  // Which course's slides match the question best? (The student's own courses only.)
  let best = courses[0];
  if (courses.length > 1) {
    const embedding = await embedQuery(message);
    const db = adminClient();
    const scores = await Promise.all(
      courses.map(async (c) => courseFit(await matchSlides(db, { courseId: c.id, embedding, query: message, k: PER_COURSE }).catch(() => []))),
    );
    best = courses[scores.reduce((bi, s, i) => (s > scores[bi] ? i : bi), 0)];
  }

  const { data: convo, error } = await supabase.from("conversations").insert({ course_id: best.id, topic_id: null }).select("id").single();
  if (error || !convo) return NextResponse.json({ error: "Couldn't start the chat. Try again." }, { status: 500 });

  const res = await forward(request, { conversation_id: convo.id, message, message_id: messageId });
  const headers = new Headers(res.headers);
  headers.set("x-conversation-id", convo.id);
  headers.set("x-course-label", encodeURIComponent(best.shownCode ? `${best.shownCode} · ${best.title}` : best.title));
  headers.set("x-course-href", encodeURIComponent(`${best.href}${best.href.includes("?") ? "&" : "?"}chat=${convo.id}`));
  headers.set("x-course-id", best.id);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
