"use client";

// The student video inside a stat card: plays muted on a loop while it's on screen, phones included
// (owner, 27 Nov 2026: the clips are ~1 MB each now). Only these see the still poster (~10 KB) and
// download no video:
//   - "save data" visitors;
//   - genuinely slow connections: the browser's estimate says 2G/3G, or under ~0.7 Mbps (each clip
//     needs ~0.5 Mbps). The bar was 1.5 Mbps, but Chrome's estimate often dips below that on Nigerian
//     Wi-Fi that plays the clips fine, so laptops showed stills.
// When the card is well off screen, the video is unloaded (not just paused) so the browser frees its
// memory; it loads again when the card comes back. Until the first frame plays, the poster shows, and
// on a stall the video holds its last frame: never a blank card.
import { useEffect, useRef } from "react";

type Connection = { saveData?: boolean; effectiveType?: string; downlink?: number };

function slowOrSaving(): boolean {
  const c = (navigator as Navigator & { connection?: Connection }).connection;
  if (!c) return false; // Safari/Firefox don't say: assume fine (the clips are small)
  if (c.saveData) return true;
  if (c.effectiveType && c.effectiveType !== "4g") return true; // "slow-2g", "2g", "3g"
  return typeof c.downlink === "number" && c.downlink > 0 && c.downlink < 0.7;
}

export function StatVideo({ src, poster, label, className = "" }: { src: string; poster: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (slowOrSaving() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // On screen: load and play. Just off screen: pause. Far off screen: unload to free memory.
    const play = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!v.getAttribute("src")) v.src = src;
        void v.play().catch(() => {});
      } else v.pause();
    });
    const release = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting && v.getAttribute("src")) {
          v.pause();
          v.removeAttribute("src");
          v.load(); // drops the downloaded video and decoder; the poster shows again
        }
      },
      { rootMargin: "100% 0px" }, // "far" = more than a screen's height away
    );
    play.observe(v);
    release.observe(v);
    return () => {
      play.disconnect();
      release.disconnect();
    };
  }, [src]);

  return <video ref={ref} poster={poster} aria-label={label} muted loop playsInline preload="none" className={`absolute inset-0 h-full w-full object-cover ${className}`} />;
}
