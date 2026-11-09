import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const KEY = /^[A-Z]{3}\d{3}-\d{2,3}-\d{1,3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_TTL_SECONDS = 60 * 60; // PRD §16: slide images only via expiring signed URLs

/** GET /api/slides/CSC420-02-12?course=<course id> → preview: signed image URL, text, material, topic.
 *  Slide keys are unique within a course (the same code can exist in several programmes). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key.toUpperCase();
  const courseId = new URL(request.url).searchParams.get("course") ?? "";
  if (!KEY.test(key) || !UUID.test(courseId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  // getClaims() verifies the session JWT locally (ES256, cached keys): no round trip to Supabase Auth
  // on every slide. The query below runs as the student, so RLS checks the token again anyway.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // One round trip, not two: the image path follows from the course and key (CSC420-02-12 →
  // <course id>/02/12.png, as ingestion writes it), so the URL is signed while the slide row is read.
  // The signature is only returned if the row exists for this student. Signing needs the service
  // role (no student-facing storage policies). Images stored before the move under the course id
  // are signed from the row's own path instead.
  const [, order, page] = key.split("-");
  const expected = `${courseId}/${order}/${Number(page)}.png`;
  const storage = adminClient().storage.from("slides");
  const [{ data: slide }, { data: signed }] = await Promise.all([
    supabase
      .from("slides")
      .select("slide_key, slide_number, title, body_text, visual_description, image_path, materials(title, kind, page_count, topics(title)), courses(code, title)")
      .eq("course_id", courseId)
      .eq("slide_key", key)
      .maybeSingle(),
    storage.createSignedUrl(expected, URL_TTL_SECONDS),
  ]);
  if (!slide) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let imageUrl: string | null = null;
  if (slide.image_path) {
    imageUrl = slide.image_path === expected ? signed?.signedUrl ?? null : (await storage.createSignedUrl(slide.image_path, URL_TTL_SECONDS)).data?.signedUrl ?? null;
  }

  const material = slide.materials as unknown as { title: string; kind: string; page_count: number; topics: { title: string } | null };
  const course = slide.courses as unknown as { code: string; title: string };
  return NextResponse.json(
    {
      slide_key: slide.slide_key,
      slide_number: slide.slide_number,
      title: slide.title,
      text: slide.body_text,
      visual_description: slide.visual_description,
      image_url: imageUrl,
      material: { title: material.title, kind: material.kind, page_count: material.page_count },
      topic: material.topics?.title ?? null,
      course,
    },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
