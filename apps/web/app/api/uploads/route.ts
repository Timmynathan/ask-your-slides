import { NextResponse } from "next/server";
import { z } from "zod";
import { planState } from "@/lib/plans/entitlement";
import { MAX_UPLOAD_MB, MAX_UPLOAD_PHOTOS, PLAN_NAMES, UPLOADS_ALLOWED } from "@/lib/plans/config";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { myCourses } from "@/lib/study/my-courses";

// Students' own uploads (owner, 20 Nov 2026). GET lists them; POST starts one: it checks the course is
// the student's, the plan allowance and the files, creates the row and returns one signed upload URL
// per file (the browser uploads straight to private storage), then the browser calls /read.

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

const Body = z.object({
  course_id: z.string().uuid(),
  title: z.string().trim().min(1, "Give it a name.").max(120),
  files: z.array(z.object({ type: z.string(), size: z.number().int().positive() })).min(1, "Add a photo or a PDF."),
});

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data } = await supabase
    .from("user_uploads")
    .select("id, course_id, title, kind, pages, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ uploads: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { course_id: courseId, title, files } = parsed.data;

  // Files: up to MAX_UPLOAD_PHOTOS photos, or one PDF.
  const pdfs = files.filter((f) => f.type === "application/pdf");
  if (pdfs.length > 1 || (pdfs.length === 1 && files.length > 1)) {
    return NextResponse.json({ error: "Upload one PDF on its own, or photos together." }, { status: 400 });
  }
  if (files.some((f) => f.type !== "application/pdf" && !IMAGE_TYPES.includes(f.type))) {
    return NextResponse.json({ error: "Only photos (JPEG, PNG, WebP) and PDFs can be uploaded." }, { status: 400 });
  }
  if (files.length > MAX_UPLOAD_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_UPLOAD_PHOTOS} photos at a time.` }, { status: 400 });
  if (files.some((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024)) return NextResponse.json({ error: `Each file can be up to ${MAX_UPLOAD_MB} MB.` }, { status: 400 });

  // The course must be one the student takes.
  const { data: profile } = await supabase.from("profiles").select("level").eq("id", auth.user.id).single();
  const courses = await myCourses(supabase, profile?.level ?? null);
  if (!courses.some((c) => c.id === courseId)) return NextResponse.json({ error: "Pick one of your courses." }, { status: 400 });

  // Plan allowance: uploads kept at once (failed ones don't count).
  const db = adminClient();
  const state = await planState(db, auth.user.id, new Date());
  const allowed = UPLOADS_ALLOWED[state.plan];
  const { count } = await db.from("user_uploads").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id).neq("status", "failed");
  if ((count ?? 0) >= allowed) {
    return NextResponse.json(
      {
        error:
          state.plan === "free"
            ? `Free includes ${allowed} uploads. Delete one, or get Finals for up to ${UPLOADS_ALLOWED.finals}.`
            : `You've reached ${allowed} uploads on ${PLAN_NAMES[state.plan]}. Delete one to add another.`,
        code: "upload_cap",
      },
      { status: 403 },
    );
  }

  const id = crypto.randomUUID();
  const paths = files.map((f, i) => `${auth.user!.id}/${id}/${String(i + 1).padStart(2, "0")}.${EXT[f.type]}`);
  const { error } = await db.from("user_uploads").insert({ id, user_id: auth.user.id, course_id: courseId, title, kind: pdfs.length ? "pdf" : "photos", files: paths });
  if (error) return NextResponse.json({ error: "Couldn't start the upload. Try again." }, { status: 500 });
  const urls = await Promise.all(paths.map((p) => db.storage.from("uploads").createSignedUploadUrl(p)));
  if (urls.some((u) => u.error || !u.data)) return NextResponse.json({ error: "Couldn't start the upload. Try again." }, { status: 500 });
  return NextResponse.json({ id, uploads: urls.map((u) => u.data!.signedUrl) }, { status: 201 });
}
