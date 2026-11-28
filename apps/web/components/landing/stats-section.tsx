// "In numbers" (owner, 20 Nov 2026): a heading beside a small collage of stat cards, one of them a
// PAU student's video. The figures are fixed text (owner's choice): edit them here.
import { StatVideo } from "./stat-video";

// ── The three figures on the landing page. Real counts on 20 Nov 2026: 63 sign-ups, 9,625 past
//    questions, 264 courses. Update them by hand as they grow. ──
const STATS = {
  students: "200+",
  gradeImprovement: "91%", // owner, 20 Nov 2026: confirmed with their users
  courses: "260+",
};

function Label({ children, onMedia = false, compact = false }: { children: React.ReactNode; onMedia?: boolean; compact?: boolean }) {
  return onMedia ? (
    <p
      className={`rounded-[14px] bg-white/95 leading-snug text-ink shadow-sm ${
        compact ? "self-start rounded-[10px] px-2.5 py-1.5 text-[12px] sm:self-auto sm:rounded-[14px] sm:px-3.5 sm:py-2.5 sm:text-[14px]" : "px-3.5 py-2.5 text-[14px]"
      }`}
    >
      {children}
    </p>
  ) : (
    <p className="text-[14px] leading-snug">{children}</p>
  );
}

export function StatsSection() {
  const big = "font-heading text-[44px] font-normal leading-none tracking-tight lg:text-[52px]";
  return (
    <section aria-labelledby="numbers" className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <h2 id="numbers" className="text-center font-heading text-4xl font-normal leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-left">
          The trusted AI learning platform for PAU students
        </h2>

        {/* Phones: a simple grid. From tablets (owner, 22 Nov 2026: iPads too): two cards side by side, the
            video card in front overlapping both; widths are shares of the space, so it shrinks a little on
            a tablet and keeps the same look. */}
        <div className="grid grid-cols-2 gap-3 sm:relative sm:mx-auto sm:block sm:h-[430px] sm:w-full sm:max-w-[620px] lg:h-[470px] lg:max-w-none">
          {/* Second student video (owner, 27 Nov 2026): her selfie, then her tablet with the app. On phones the
              card is small, so the label is compact and the picture is shifted to keep her face clear. */}
          <div className="relative aspect-square overflow-hidden rounded-[22px] bg-navy sm:absolute sm:left-0 sm:top-0 sm:aspect-auto sm:h-[230px] sm:w-[47%] lg:h-[250px]">
            {/* 28 Nov 2026: 0:16–0:25 of the owner's new clip (studying with her notes and the app on her tablet). */}
            <StatVideo src="/social/peer-2.mp4" poster="/social/peer-2-poster.webp" label="A PAU student studying with her notes and Ask Your Slides on her tablet" />
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/35 via-transparent to-transparent p-5 text-white">
              <p className={big}>{STATS.students}</p>
              <Label onMedia compact>PAU students signed up</Label>
            </div>
          </div>

          <div className="relative row-span-2 overflow-hidden rounded-[22px] bg-navy sm:absolute sm:left-[38%] sm:top-[135px] sm:z-10 sm:h-[290px] sm:w-[40%] sm:ring-4 sm:ring-page lg:top-[150px] lg:h-[310px]">
            <StatVideo src="/social/peer-1.mp4" poster="/social/peer-1-poster.webp" label="A PAU student revising with Ask Your Slides" />
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/35 via-transparent to-transparent p-4 text-white">
              <p className={big}>{STATS.gradeImprovement}</p>
              <Label onMedia>of regularly active users reported grade improvements</Label>
            </div>
          </div>

          <div className="flex aspect-square flex-col justify-between rounded-[22px] bg-navy p-5 text-white sm:absolute sm:right-0 sm:top-0 sm:justify-start sm:gap-3 sm:aspect-auto sm:h-[230px] sm:w-[47%] lg:h-[250px]">
            <p className={big}>{STATS.courses}</p>
            <Label>PAU courses with their slides already loaded</Label>
          </div>
        </div>
      </div>
    </section>
  );
}
