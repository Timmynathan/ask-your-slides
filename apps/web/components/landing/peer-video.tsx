"use client";

// A student video on the landing page with the page's own controls (owner, 19 Nov 2026): no browser
// control bar, one small light-blue play button in the middle. Tap the video to pause; the button
// comes back when paused or finished. A thin sky-blue line shows progress while it plays.
import { useRef, useState } from "react";

export function PeerVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }

  return (
    <div className="relative aspect-[9/16] w-[260px] overflow-hidden rounded-[25px] bg-black ring-1 ring-line sm:w-[290px]">
      <video
        ref={ref}
        src={src}
        poster={poster}
        aria-label={label}
        playsInline
        preload="none"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setProgress(v.duration ? v.currentTime / v.duration : 0);
        }}
        className="h-full w-full cursor-pointer object-cover"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause video" : "Play video"}
        className={`absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-pau-400/60 text-white ring-1 ring-white/50 backdrop-blur-sm transition hover:bg-pau-400/75 active:scale-95 ${
          playing ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="ml-0.5">
          <path d="M6 4.2v11.6a.8.8 0 0 0 1.2.7l9.3-5.8a.8.8 0 0 0 0-1.4L7.2 3.5a.8.8 0 0 0-1.2.7Z" fill="currentColor" />
        </svg>
      </button>
      {progress > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/20" aria-hidden>
          <div className="h-full bg-pau-400" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
