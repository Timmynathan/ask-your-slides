import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseSlideKey } from "@/lib/study/course-code";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PRD §16: slide images only via expiring signed URLs. Each link is reused for its first 45 minutes
// (per server instance), so the same slide gets the same link and the browser and the storage CDN can
// serve the image from cache instead of downloading it again (owner, 23 Nov 2026). The browser keeps a
// slide for up to 45 minutes (lib/study/slide-cache.ts), so a link is used at most 90 minutes after
// signing, well inside its 2 hours.
const URL_TTL_SECONDS = 2 * 60 * 60;
const REUSE_MS = 45 * 60 * 1000;
const signedCache = new Map<string, { url: string; at: number }>();

function cachedUrl(path: string): string | null {
  const hit = signedCache.get(path);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.url;
  if (hit) signedCache.delete(path);
  return null;
}

function remember(path: string, url: string) {
  if (signedCache.size > 5000) signedCache.clear(); // a simple bound: links are cheap to make again
  signedCache.set(path, { url, at: Date.now() });
}

/** GET /api/slides/CSC420-02-12?course=<course id> → preview: signed image URL, text, material, topic.
 *  Slide keys are unique within a course (the same code can exist in several programmes). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key.toUpperCase();
  const courseId = new URL(request.url).searchParams.get("course") ?? "";
  const parsed = parseSlideKey(key);
  if (!parsed || !UUID.test(courseId)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const supabase = await createClient();
  // getClaims() verifies the session JWT locally (ES256, cached keys): no round trip to Supabase Auth
  // on every slide. The query below runs as the student, so RLS checks the token again anyway.
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // One round trip, not two: the image path follows from the course and key (CSC420-02-12 →
  // <course id>/02/12.webp, or .png for materials ingested before Nov 2026), so both are signed in
  // one request while the slide row is read. The signature is only returned if the row exists for
  // this student. Signing needs the service role (no student-facing storage policies). Images stored
  // before the move under the course id are signed from the row's own path instead.
  const base = `${courseId}/${parsed.order}/${parsed.number}`;
  const storage = adminClient().storage.from("slides");
  const known = cachedUrl(`${base}.webp`) ?? cachedUrl(`${base}.png`);
  const [{ data: slide }, { data: signed }] = await Promise.all([
    supabase
      .from("slides")
      .select("slide_key, slide_number, title, body_text, visual_description, image_path, label, view, materials(title, kind, page_count, source, topics(title)), courses(code, title)")
      .eq("course_id", courseId)
      .eq("slide_key", key)
      .maybeSingle(),
    known ? Promise.resolve({ data: null }) : storage.createSignedUrls([`${base}.webp`, `${base}.png`], URL_TTL_SECONDS),
  ]);
  if (!slide) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let imageUrl: string | null = null;
  if (slide.image_path) {
    imageUrl = cachedUrl(slide.image_path);
    if (!imageUrl) {
      const guessed = signed?.find((s) => s.path === slide.image_path && !s.error)?.signedUrl;
      imageUrl = guessed ?? (await storage.createSignedUrl(slide.image_path, URL_TTL_SECONDS)).data?.signedUrl ?? null;
      if (imageUrl) remember(slide.image_path, imageUrl);
    }
  }

  const material = slide.materials as unknown as { title: string; kind: string; page_count: number; source: string; topics: { title: string } | null };
  const course = slide.courses as unknown as { code: string; title: string };
  return NextResponse.json(
    {
      slide_key: slide.slide_key,
      slide_number: slide.slide_number,
      title: slide.title,
      text: slide.body_text,
      visual_description: slide.visual_description,
      image_url: imageUrl,
      material: { title: material.title, kind: material.kind, page_count: material.page_count, source: material.source },
      topic: material.topics?.title ?? null,
      label: slide.label,
      view: slide.view,
      course,
    },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
