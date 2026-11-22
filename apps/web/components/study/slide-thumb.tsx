"use client";

// The slide itself under an answer to a visual question ("explain this graphically", "show me the
// diagram"), when the slide viewer is closed (owner, 22 Nov 2026). The first slide the answer cites;
// tapping it opens the viewer there. Costs nothing extra: the same signed image the viewer uses.
import { useEffect, useState } from "react";
import { loadSlide } from "@/lib/study/slide-cache";

/** The student asked to see something rather than read it. */
export const VISUAL_ASK = /\b(graph(ically|ical)?|diagrams?|draw|sketch|visual(ly)?|illustrat\w*|charts?|figure|picture|show me)\b/i;

/** The first slide key an answer cites ([[s:CSC402-04-12]]), or null. */
export function firstCited(text: string): string | null {
  return text.match(/\[\[s:([A-Z]{3}\d{3}-\d{2,3}-\d{1,3})\]\]/)?.[1] ?? null;
}

export function SlideThumb({ courseId, slideKey, onOpen }: { courseId: string; slideKey: string; onOpen(key: string): void }) {
  const [slide, setSlide] = useState<{ url: string; label: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSlide(courseId, slideKey)
      .then((d) => {
        if (!cancelled && d.image_url) setSlide({ url: d.image_url, label: `${d.material.title}, slide ${d.slide_number}` });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId, slideKey]);
  if (!slide) return null;
  return (
    <button type="button" onClick={() => onOpen(slideKey)} className="group mt-4 block w-full max-w-md overflow-hidden rounded-2xl bg-card text-left ring-1 ring-line transition hover:shadow-md" title="Open this slide">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring Supabase URL */}
      <img src={slide.url} alt={slide.label} className="w-full" loading="lazy" />
      <span className="block px-3 py-2 text-[12.5px] text-muted group-hover:text-ink">From your slides: {slide.label}</span>
    </button>
  );
}
