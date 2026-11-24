import { isAdminEmail } from "@/lib/admin";
import { buildSignIn, buildUpdate, type Built } from "@/lib/email/send";
import { sampleCourse } from "@/lib/email/sample";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /admin/emails/preview?type=signin|welcome|pastq|newslides[&text=1] → the email as it will look
// (owner only), with sample data: code 123456, the admin's own name, a course with past questions.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !isAdminEmail(auth.user.email)) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "signin";
  const db = adminClient();
  const { data: me } = await db.from("profiles").select("display_name").eq("id", auth.user.id).single();
  let email: Built;
  if (type === "signin") email = await buildSignIn("123456");
  else if (type === "welcome" || type === "pastq" || type === "newslides")
    email = await buildUpdate(type, { userId: auth.user.id, name: me?.display_name ?? null, course: type === "welcome" ? null : await sampleCourse(db, url.searchParams.get("course") ?? undefined) });
  else return new Response("Unknown type. Use signin, welcome, pastq or newslides.", { status: 400 });
  if (url.searchParams.get("text") === "1") return new Response(`Subject: ${email.subject}\n\n${email.text}`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(email.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
