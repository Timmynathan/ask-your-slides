"use client";

// A Link that loads its page in full as soon as the pointer is over it or a finger touches it, so
// the click opens it at once (owner, 21 Nov 2026: courses took a while to open from the dashboard).
// Until then it prefetches as usual (only the page's shell), so a dashboard full of cards doesn't
// load every course up front.
import Link from "next/link";
import { useState, type ComponentProps } from "react";

export function HoverLink({ onPointerEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [full, setFull] = useState(false);
  return (
    <Link
      {...props}
      prefetch={full ? true : null}
      onPointerEnter={(e) => {
        setFull(true);
        onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        setFull(true);
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setFull(true);
        onFocus?.(e);
      }}
    />
  );
}
