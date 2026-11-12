"use client";

// Landing nav: a floating pill at the top of the page that stretches into a full-width bar
// (square corners, no side gap) as soon as the page scrolls, and back to the pill at the top.
import { useEffect, useState, type ReactNode } from "react";

export function StretchNav({ children }: { children: ReactNode }) {
  const [stretched, setStretched] = useState(false);

  useEffect(() => {
    const update = () => setStretched(window.scrollY > 4);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      data-stretched={stretched}
      className={`sticky top-0 z-20 transition-[padding] duration-300 ease-out motion-reduce:transition-none ${
        stretched ? "px-0 pt-0" : "px-3 pt-3 sm:px-5"
      }`}
    >
      <nav
        className={`mx-auto flex h-16 items-center justify-between border-line bg-page/85 backdrop-blur transition-[max-width,border-radius,padding,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
          stretched
            ? "max-w-[100vw] rounded-none border-b pl-5 pr-3 shadow-[0_1px_12px_rgba(0,0,0,0.06)] sm:pl-8 sm:pr-5"
            : "max-w-6xl rounded-[32px] border pl-5 pr-2"
        }`}
      >
        {children}
      </nav>
    </header>
  );
}
