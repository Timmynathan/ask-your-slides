import "server-only";
import { must } from "@/lib/supabase/admin";
import type { AgentContext } from "./tools";

// Slide images for the model (owner, 23 Nov 2026, option B: only when it helps). The model normally
// reads each slide's text (plus a picture description for about a third of slides); the image adds
// what text loses: chart values, arrow labels, equation layout. A 1280×720 slide is about 1,230 input
// tokens (~$0.00012 on Haiku), so images go only where they matter: a question about a diagram or
// chart, "Ask about this slide" from the viewer, a slide that is mostly picture, or the model's own
// view_slides call. At most MAX_SLIDE_IMAGES per call.

export const MAX_SLIDE_IMAGES = 3;
/** A slide with less text than this and a picture description is "mostly picture". */
const PICTURE_TEXT_MAX = 300;

/** The student asks about something to look at rather than read. */
export const ASKS_VISUAL =
  /\b(graph(ically|ical|s)?|diagrams?|draw(ing|n)?|sketch|visual(ly|s)?|illustrat\w*|charts?|figures?|pictures?|images?|plots?|curves?|axes|axis|flow ?charts?|tables?|labell?ed|arrows?|what does (this|the|that) slide show|show me)\b/i;

export interface SlideImage {
  key: string;
  data: string; // base64
  mediaType: string;
}

interface SlideRow {
  slide_key: string;
  image_path: string | null;
  visual_description: string | null;
  body_text: string | null;
}

async function rows(ctx: AgentContext, keys: string[]): Promise<SlideRow[]> {
  if (!keys.length) return [];
  return must(
    await ctx.db.from("slides").select("slide_key, image_path, visual_description, body_text").eq("course_id", ctx.courseId).in("slide_key", keys),
  ) as SlideRow[];
}

/** Of these slides, the ones that are mostly picture (a description, little text), in the given order. */
export async function pictureSlides(ctx: AgentContext, keys: string[]): Promise<string[]> {
  const found = await rows(ctx, keys);
  const picture = new Set(
    found.filter((r) => r.image_path && r.visual_description && (r.body_text ?? "").trim().length < PICTURE_TEXT_MAX).map((r) => r.slide_key),
  );
  return keys.filter((k) => picture.has(k));
}

/** The images of these slides (this course only), in the given order; slides without one are skipped. */
export async function slideImages(ctx: AgentContext, keys: string[]): Promise<SlideImage[]> {
  const found = new Map((await rows(ctx, keys.slice(0, MAX_SLIDE_IMAGES))).map((r) => [r.slide_key, r]));
  const out = await Promise.all(
    keys.slice(0, MAX_SLIDE_IMAGES).map(async (key) => {
      const path = found.get(key)?.image_path;
      if (!path) return null;
      const { data, error } = await ctx.db.storage.from("slides").download(path);
      if (error || !data) return null;
      const mediaType = path.endsWith(".png") ? "image/png" : path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg" : "image/webp";
      return { key, data: Buffer.from(await data.arrayBuffer()).toString("base64"), mediaType };
    }),
  );
  return out.filter((x): x is SlideImage => !!x);
}
