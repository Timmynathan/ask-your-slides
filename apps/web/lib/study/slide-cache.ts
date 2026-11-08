"use client";

// Slides already opened (or about to be) stay in memory, so flipping back, re-opening a citation or
// a source is instant. Each entry is the API response plus its signed image URL (valid 1 hour); the
// image itself is preloaded into the browser cache under that same URL. Entries expire before the
// URL does.
export interface SlidePreviewData {
  slide_key: string;
  slide_number: number;
  title: string | null;
  text: string | null;
  visual_description: string | null;
  image_url: string | null;
  material: { title: string; kind: string; page_count: number };
  topic: string | null;
}

const TTL_MS = 45 * 60 * 1000;
const cache = new Map<string, { at: number; data: Promise<SlidePreviewData> }>();

function preloadImage(url: string | null) {
  if (!url || typeof Image === "undefined") return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

export function loadSlide(key: string): Promise<SlidePreviewData> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = fetch(`/api/slides/${key}`).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't load this slide.");
    const d = (await r.json()) as SlidePreviewData;
    preloadImage(d.image_url);
    return d;
  });
  cache.set(key, { at: Date.now(), data });
  data.catch(() => cache.delete(key)); // never cache a failure
  return data;
}

/** Start loading a slide the student is likely to open next (hover, neighbouring page). */
export function prefetchSlide(key: string) {
  loadSlide(key).catch(() => {});
}

/** The key of another page of the same material: CSC420-02-12 → CSC420-02-13. */
export function pageKey(key: string, page: number) {
  return key.replace(/-\d+$/, `-${page}`);
}
