"use client";

// The Ask anything page (owner, 22 Nov 2026), laid out like a fresh chat: the study partner in the
// middle (hover the page and the others come out to swap, as in the course chats), the typed greeting,
// up to five short question chips with icons (3 on top, 2 below), and the box pinned to the bottom.
import Link from "next/link";
import { useState } from "react";
import { BookOpen, Brain, CalendarCheck, FileText, Lightbulb, Network, type LucideIcon } from "lucide-react";
import { AskBox } from "@/components/dashboard/ask-box";
import { AskGreeting } from "@/components/chat/ask-greeting";
import { PartnerCast } from "@/components/chat/partner-cast";
import { PartnerSwitch } from "@/components/study/partner-switch";
import { PARTNERS, type PartnerId } from "@/lib/partners";

const ICONS: Record<string, LucideIcon> = { brain: Brain, network: Network, plan: CalendarCheck, quiz: Lightbulb, points: FileText, about: BookOpen };
export type AskChip = { label: string; href: string; icon: keyof typeof ICONS };

export function AskView({ partner: initial, account, chips, courses }: {
  partner: PartnerId;
  account: string;
  chips: AskChip[];
  courses: { code: string; shownCode: string | null; title: string; href: string }[];
}) {
  const [partner, setPartner] = useState<PartnerId>(initial);
  const [picking, setPicking] = useState(false);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center justify-end px-4 sm:px-6">
        <PartnerSwitch partner={partner} onChanged={setPartner} open={picking} onOpenChange={setPicking} account={account} />
      </header>
      {/* Hovering here (not the box at the bottom, which has focus) brings the other partners out. */}
      <div className="group/chat flex flex-1 flex-col items-center justify-center px-4 pb-6">
        <PartnerCast partner={partner} onChangePartner={() => setPicking(true)} />
        <AskGreeting key={partner} partnerName={PARTNERS[partner].name} />
        {chips.length > 0 && (
          // Three on top, the rest below (owner, 22 Nov 2026); on phones each row wraps.
          <div className="mx-auto mt-6 flex max-w-[44rem] flex-wrap justify-center gap-2 sm:flex-col sm:items-center" role="list" aria-label="Questions to start with">
            {[chips.slice(0, 3), chips.slice(3)].filter((row) => row.length).map((row, i) => (
              <div key={i} className="contents sm:flex sm:justify-center sm:gap-2">
                {row.map((c) => {
                  const Icon = ICONS[c.icon];
                  return (
                    <Link key={c.label} role="listitem" href={c.href} className="inline-flex items-center gap-2 rounded-full bg-sunken/70 py-1.5 pl-1.5 pr-3.5 text-[13px] text-ink transition hover:bg-sunken active:scale-95 sm:text-[13.5px]">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-card text-brand">
                        <Icon size={14} absoluteStrokeWidth strokeWidth={1.6} aria-hidden />
                      </span>
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            ))}
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
