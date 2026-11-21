"use client";

// The chosen study partner with the other three hidden behind it (owner, 20–21 Nov 2026): while the
// pointer is over the chat (an ancestor with `group/chat`), all three slide out together and a quiet
// "Change character" button appears. Used by the general chat and every course chat.
import { Mascot } from "@/components/mascot/mascot";
import { PARTNER_IDS, type PartnerId } from "@/lib/partners";

// Final spots in a 150×112 box; each waits behind the centre (75, 56) until hover.
const SPOTS = [
  { left: 8, top: 54, size: 38 },
  { left: 104, top: 52, size: 38 },
  { left: 92, top: 0, size: 34 },
];

export function PartnerCast({ partner, onChangePartner }: { partner: PartnerId; onChangePartner(): void }) {
  const others = PARTNER_IDS.filter((id) => id !== partner);
  return (
    <>
      <div className="relative mx-auto h-[112px] w-[150px]">
        {others.map((id, i) => {
          const spot = SPOTS[i];
          const dx = 75 - (spot.left + spot.size / 2);
          const dy = 56 - (spot.top + spot.size / 2);
          return (
            <span
              key={id}
              className="absolute z-0 [transform:translate(var(--dx),var(--dy))_scale(0.5)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform group-focus-within/chat:[transform:none] group-hover/chat:[transform:none] motion-reduce:transition-none"
              style={{ left: spot.left, top: spot.top, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` }}
            >
              <Mascot partner={id} size={spot.size} animated={false} />
            </span>
          );
        })}
        <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <Mascot partner={partner} size={96} mood="happy" animated={false} />
        </span>
      </div>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onChangePartner}
          className="translate-y-1 rounded-full bg-sunken px-3 py-1 text-[12.5px] text-muted opacity-0 transition-[opacity,transform,color] duration-300 ease-out hover:text-ink focus:translate-y-0 focus:opacity-100 active:scale-95 group-hover/chat:translate-y-0 group-hover/chat:opacity-100"
        >
          Change character
        </button>
      </div>
    </>
  );
}
