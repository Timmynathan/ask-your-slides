"use client";

// The student video inside a stat card: plays muted on a loop while it's on screen, on laptops and
// tablets only. Everyone else sees the still poster (~10 KB) and downloads no video:
//   - phones (often on mobile data) and "save data" visitors;
//   - slow connections (owner, 27 Nov 2026): the browser's estimate says 3G or slower, or under ~1.5 Mbps
//     (each clip needs ~0.5 Mbps, and two play at once), so it would stutter rather than play.
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
  return typeof c.downlink === "number" && c.downlink > 0 && c.downlink < 1.5;
}

export function StatVideo({ src, poster, label, className = "" }: { src: string; poster: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (slowOrSaving() || !window.matchMedia("(min-width: 640px)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
