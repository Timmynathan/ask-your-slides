import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail } from "@/lib/admin";
import { runEmailQueue } from "@/lib/email/queue";
import { buildSignIn, buildUpdate, sendEmail } from "@/lib/email/send";
import { sampleCourse } from "@/lib/email/sample";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/admin/emails (owner only; anyone else gets a plain 404):
//   {action: "enqueue", type: "pastq"|"newslides", courseId}  queue that email for the course's students
//   {action: "test", type: "signin"|"welcome"|"pastq"|"newslides", courseId?}  send one to me now
//   {action: "run"}  run the hourly queue now
export const maxDuration = 60;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enqueue"), type: z.enum(["pastq", "newslides"]), courseId: z.string().uuid() }),
  z.object({ action: z.literal("test"), type: z.enum(["signin", "welcome", "pastq", "newslides"]), courseId: z.string().uuid().optional() }),
  z.object({ action: z.literal("run") }),
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.email || !isAdminEmail(auth.user.email)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const db = adminClient();
  const b = parsed.data;

  if (b.action === "run") return NextResponse.json(await runEmailQueue(db));

  if (b.action === "enqueue") {
    const { data, error } = await db.rpc("enqueue_course_email", { p_course: b.courseId, p_type: b.type });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ queued: Number(data ?? 0) });
  }

  // A test goes to the signed-in admin, outside the queue and the limits.
  const { data: me } = await db.from("profiles").select("display_name").eq("id", auth.user.id).single();
  const email =
    b.type === "signin"
      ? await buildSignIn("123456")
      : await buildUpdate(b.type, { userId: auth.user.id, name: me?.display_name ?? null, course: b.type === "welcome" ? null : await sampleCourse(db, b.courseId) });
  const sent = await sendEmail(auth.user.email, { ...email, subject: `[Test] ${email.subject}` }, `test-${b.type}`);
  if (sent.error) return NextResponse.json({ error: sent.error }, { status: 502 });
  await db.from("email_sends").insert({ user_id: auth.user.id, type: "test", resend_id: sent.id });
  return NextResponse.json({ sent: true, to: auth.user.email });
}
