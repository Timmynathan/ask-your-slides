"use client";

// The Ask anything page's greeting (owner, 22 Nov 2026): the study partner types "Hello, I'm Ada."
// and then "What can I help you with?…" on a second line, smaller than a page title.
import { useState } from "react";
import { Typewriter } from "@/components/ui/typewriter";

export function AskGreeting({ partnerName }: { partnerName: string }) {
  const [helloDone, setHelloDone] = useState(false);
  return (
    <div className="mt-5 text-center">
      <h1 className="font-heading text-[24px] font-medium tracking-tight text-ink sm:text-[26px]">
        <Typewriter parts={[`Hello, I'm ${partnerName}.`]} delay={200} onDone={() => setHelloDone(true)} />
      </h1>
      <p className="mx-auto mt-2 min-h-[3.3em] max-w-md text-[15.5px] leading-relaxed text-muted">
        {helloDone ? <Typewriter parts={["What can I help you with? Ask me anything you'd like to learn about."]} delay={250} /> : <span aria-hidden>&nbsp;</span>}
      </p>
    </div>
  );
}
