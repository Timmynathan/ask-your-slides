import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const KEY = /^[A-Z]{3}\d{3}-\d{2,3}-\d{1,3}$/;
const URL_TTL_SECONDS = 60 * 60; // PRD §16: slide images only via expiring signed URLs

/** GET /api/slides/CSC420-02-12 → preview: signed image URL, text, material, topic. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key.toUpperCase();
  if (!KEY.test(key)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Read as the student (RLS: signed-in users can read course content).
  const { data: slide } = await supabase
    .from("slides")
    .select("slide_key, slide_number, title, body_text, visual_description, image_path, materials(title, kind, page_count, topics(title)), courses(code, title)")
    .eq("slide_key", key)
    .maybeSingle();
  if (!slide) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Signing needs the service role; the bucket has no student-facing policies.
  const { data: signed } = slide.image_path
    ? await adminClient().storage.from("slides").createSignedUrl(slide.image_path, URL_TTL_SECONDS)
    : { data: null };

  const material = slide.materials as unknown as { title: string; kind: string; page_count: number; topics: { title: string } | null };
  const course = slide.courses as unknown as { code: string; title: string };
  return NextResponse.json(
    {
      slide_key: slide.slide_key,
      slide_number: slide.slide_number,
      title: slide.title,
      text: slide.body_text,
      visual_description: slide.visual_description,
      image_url: signed?.signedUrl ?? null,
      material: { title: material.title, kind: material.kind, page_count: material.page_count },
      topic: material.topics?.title ?? null,
      course,
    },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
