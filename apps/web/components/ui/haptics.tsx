"use client";

import { useEffect } from "react";

// A short vibration when a button or link is tapped on a touch screen. Works on Android browsers;
// iOS Safari doesn't let websites vibrate, so there the visual press state is the feedback.
export function Haptics() {
  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const el = (e.target as Element | null)?.closest("button:not(:disabled), a[href], [role='button']");
      if (el) navigator.vibrate(8);
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
