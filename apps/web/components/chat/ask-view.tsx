"use client";

// The Ask anything page (owner, 22 Nov 2026), laid out like a fresh chat: the study partner in the
// middle (hover the page and the others come out to swap, as in the course chats), the typed greeting,
// four general question chips with icons, and the box pinned to the bottom. A chip isn't tied to a
// lecture: tapping it asks "Which course?", then opens that course with the question asked, and the
// chat carries on there (a quiz then asks which topic).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, Brain, CalendarCheck, Lightbulb, type LucideIcon } from "lucide-react";
import { askHref } from "@/lib/study/course-link";
import { AskBox } from "@/components/dashboard/ask-box";
import { AskGreeting } from "@/components/chat/ask-greeting";
import { PartnerCast } from "@/components/chat/partner-cast";
import { PartnerSwitch } from "@/components/study/partner-switch";
import { PARTNERS, type PartnerId } from "@/lib/partners";

const CHIPS: { label: string; question: string; icon: LucideIcon }[] = [
  { label: "Make a study plan", question: "Make me a study plan for this course before my exam.", icon: CalendarCheck },
  { label: "Quiz me", question: "Quiz me on this course. Ask me which topic first.", icon: Lightbulb },
  { label: "Explain the hardest topic", question: "Which topic in this course is usually the hardest to understand? Explain it simply.", icon: Brain },
  { label: "What's in this course?", question: "What is this course about, and what are its main topics?", icon: BookOpen },
];

export function AskView({ partner: initial, account, courses }: {
  partner: PartnerId;
  account: string;
  courses: { code: string; shownCode: string | null; title: string; href: string }[];
}) {
  const router = useRouter();
  const [partner, setPartner] = useState<PartnerId>(initial);
  const [picking, setPicking] = useState(false);
  // The chip waiting for a course; with one course there's nothing to pick.
  const [chip, setChip] = useState<(typeof CHIPS)[number] | null>(null);
  const choose = (c: (typeof CHIPS)[number]) => (courses.length === 1 ? router.push(askHref(courses[0].href, c.question)) : setChip(c));
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-end px-4 sm:px-6">
        <PartnerSwitch partner={partner} onChanged={setPartner} open={picking} onOpenChange={setPicking} account={account} />
      </header>
      {/* Hovering here (not the box at the bottom, which has focus) brings the other partners out. */}
      <div className="group/chat flex flex-1 flex-col items-center justify-center px-4 pb-6">
        <PartnerCast partner={partner} onChangePartner={() => setPicking(true)} />
        <AskGreeting key={partner} partnerName={PARTNERS[partner].name} />
        {/* Two on top, two below on laptops; they wrap on phones. */}
        <div className="mx-auto mt-6 grid max-w-md grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Questions to start with">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => choose(c)}
              aria-pressed={chip?.label === c.label}
              className={`inline-flex items-center justify-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13px] text-ink transition active:scale-95 sm:text-[13.5px] ${chip?.label === c.label ? "bg-pau-100 ring-1 ring-brand/30" : "bg-sunken/70 hover:bg-sunken"}`}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-card text-brand">
                <c.icon size={14} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
              </span>
              {c.label}
            </button>
          ))}
        </div>
        {chip && (
          <div className="pop-in mx-auto mt-4 w-full max-w-xl rounded-2xl bg-sunken/70 p-4 text-center">
            <p className="text-[14px] text-ink">Which course?</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {courses.map((c) => (
                <button
                  key={c.href}
                  type="button"
                  onClick={() => router.push(askHref(c.href, chip.question))}
                  className="rounded-full bg-card px-3.5 py-1.5 text-[13.5px] text-ink ring-1 ring-line transition hover:ring-brand active:scale-95"
                >
                  {c.shownCode ?? c.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Pinned to the bottom, like a chat box. */}
      <div className="sticky bottom-0 bg-page px-4 pb-5 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <AskBox courses={courses} pinned />
        </div>
      </div>
    </div>
  );
}
