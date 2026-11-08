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
  // getClaims() verifies the session JWT locally (ES256, cached keys): no round trip to Supabase Auth
  // on every slide. The query below runs as the student, so RLS checks the token again anyway.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // One round trip, not two: the image path follows from the key (CSC420-02-12 → CSC420/02/12.png,
  // as ingestion writes it), so the URL is signed while the slide row is read. The signature is only
  // returned if the row exists for this student. Signing needs the service role (no student-facing
  // storage policies).
  const [code, order, page] = key.split("-");
  const [{ data: slide }, { data: signed }] = await Promise.all([
    supabase
      .from("slides")
      .select("slide_key, slide_number, title, body_text, visual_description, image_path, materials(title, kind, page_count, topics(title)), courses(code, title)")
      .eq("slide_key", key)
      .maybeSingle(),
    adminClient().storage.from("slides").createSignedUrl(`${code}/${order}/${Number(page)}.png`, URL_TTL_SECONDS),
  ]);
  if (!slide) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const material = slide.materials as unknown as { title: string; kind: string; page_count: number; topics: { title: string } | null };
  const course = slide.courses as unknown as { code: string; title: string };
  return NextResponse.json(
    {
      slide_key: slide.slide_key,
      slide_number: slide.slide_number,
      title: slide.title,
      text: slide.body_text,
      visual_description: slide.visual_description,
      image_url: slide.image_path ? signed?.signedUrl ?? null : null,
      material: { title: material.title, kind: material.kind, page_count: material.page_count },
      topic: material.topics?.title ?? null,
      course,
    },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
