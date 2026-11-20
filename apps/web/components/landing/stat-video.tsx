"use client";

// The student video inside a stat card: plays muted on a loop while it's on screen, on laptops and
// tablets only. Phones (often on mobile data) and "save data" visitors see the still poster: the
// video is ~6 MB and nothing downloads until it plays.
import { useEffect, useRef } from "react";

export function StatVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || !window.matchMedia("(min-width: 640px)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!v.src) v.src = src;
        void v.play().catch(() => {});
      } else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  return <video ref={ref} poster={poster} aria-label={label} muted loop playsInline preload="none" className="absolute inset-0 h-full w-full object-cover" />;
}
