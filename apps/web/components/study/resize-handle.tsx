"use client";

// A drag handle on the left edge of a right-hand panel (Sources, the slide viewer), laptops only
// (owner, 21 Nov 2026). Reports how far the pointer has moved since the drag started; the parent
// decides the width (and whether the panel closes).
import { useRef, useState } from "react";

export function ResizeHandle({ label, onStart, onMove, onEnd }: { label: string; onStart(): void; onMove(dx: number): void; onEnd(): void }) {
  const start = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="relative hidden w-0 shrink-0 xl:block">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        onPointerDown={(e) => {
          start.current = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          onStart();
        }}
        onPointerMove={(e) => start.current !== null && onMove(e.clientX - start.current)}
        onPointerUp={() => {
          if (start.current === null) return;
          start.current = null;
          setDragging(false);
          onEnd();
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          onEnd();
        }}
        className={`absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize touch-none transition-colors ${dragging ? "bg-pau-300/60" : "hover:bg-pau-200/60"}`}
      />
    </div>
  );
}
