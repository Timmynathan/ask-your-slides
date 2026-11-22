"use client";

// The study partner greets the student at the top of the dashboard (owner, 22 Nov 2026): two speech
// bubbles that type themselves out, one after the other. The second, only for a student who has chatted
// before, links back to the course and straight into the last chat.
import { useState } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { Typewriter, type TypePart } from "@/components/ui/typewriter";
import { PARTNERS, type PartnerId } from "@/lib/partners";

interface Props {
  partner: PartnerId;
  name: string | null;
  lastStudied: { course: string; courseHref: string; chatHref: string } | null;
}

export function PartnerGreeting({ partner, name, lastStudied }: Props) {
  const [firstDone, setFirstDone] = useState(false);
  const first = name?.trim().split(/\s+/)[0] ?? "";
  const hello: TypePart[] = [
    first ? "Hey, " : "Hey",
    ...(first ? [{ text: first, bold: true }] : []),
    `. I'm ${PARTNERS[partner].name}, your study partner, here to help you understand anything in your slides.`,
  ];
  const back: TypePart[] | null = lastStudied
    ? ["Your last used topic was from ", { text: lastStudied.course, href: lastStudied.courseHref }, ". Shall we jump back in and ", { text: "continue learning", href: lastStudied.chatHref }, "?"]
    : null;

  return (
    <div className="mb-6 space-y-3">
      <Bubble partner={partner}>
        <Typewriter parts={hello} delay={200} onDone={() => setFirstDone(true)} />
      </Bubble>
      {back && (
        <div className={`transition-opacity duration-300 ${firstDone ? "opacity-100" : "opacity-0"}`} aria-hidden={!firstDone}>
          <Bubble partner={partner}>{firstDone ? <Typewriter parts={back} delay={150} /> : <Typewriter parts={back} delay={1e9} />}</Bubble>
        </div>
      )}
    </div>
  );
}

function Bubble({ partner, children }: { partner: PartnerId; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[#ecdcfb] sm:h-14 sm:w-14">
        <Mascot partner={partner} size={44} mood="happy" animated={false} />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink/85 bg-sunken/60 px-4 py-3 font-heading text-[15px] leading-relaxed text-ink sm:px-6 sm:py-4 sm:text-[17px]">
        {children}
      </div>
    </div>
  );
}
