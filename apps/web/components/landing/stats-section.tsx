// "In numbers" (owner, 20 Nov 2026): a heading beside a small collage of stat cards, one of them a
// PAU student's video. The figures are fixed text (owner's choice): edit them here.
import { StatVideo } from "./stat-video";

// ── The three figures on the landing page. Real counts on 20 Nov 2026: 63 sign-ups, 9,625 past
//    questions, 264 courses. Update them by hand as they grow. ──
const STATS = {
  students: "100+",
  pastQuestions: "9,600+",
  courses: "260+",
};

function Label({ children, onMedia = false }: { children: React.ReactNode; onMedia?: boolean }) {
  return onMedia ? (
    <p className="rounded-[14px] bg-white/95 px-3.5 py-2.5 text-[14px] leading-snug text-ink shadow-sm">{children}</p>
  ) : (
    <p className="text-[14px] leading-snug">{children}</p>
  );
}

export function StatsSection() {
  const big = "font-heading text-[44px] font-normal leading-none tracking-tight sm:text-[52px]";
  return (
    <section aria-labelledby="numbers" className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <h2 id="numbers" className="text-center font-heading text-4xl font-normal leading-[1.1] tracking-tight text-ink sm:text-5xl lg:text-left">
          The trusted AI learning platform for PAU students
        </h2>

        {/* Phones: a simple grid. From lg: two cards side by side, the video card in front overlapping both. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:relative lg:block lg:h-[470px]">
          <div className="flex aspect-square flex-col justify-between rounded-[22px] bg-pau-100 p-5 text-ink lg:absolute lg:left-0 lg:top-0 lg:aspect-auto lg:h-[250px] lg:w-[290px]">
            <p className={big}>{STATS.students}</p>
            <Label>PAU students signed up</Label>
          </div>

          <div className="relative row-span-2 overflow-hidden rounded-[22px] bg-navy lg:absolute lg:left-[38%] lg:top-[150px] lg:z-10 lg:h-[310px] lg:w-[250px] lg:ring-4 lg:ring-page">
            <StatVideo src="/social/peer-1.mp4" poster="/social/peer-1-poster.webp" label="A PAU student revising with Ask Your Slides" />
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/35 via-transparent to-transparent p-4 text-white">
              <p className={big}>{STATS.pastQuestions}</p>
              <Label onMedia>past questions from real PAU papers</Label>
            </div>
          </div>

          <div className="flex aspect-square flex-col justify-between rounded-[22px] bg-navy p-5 text-white lg:absolute lg:right-0 lg:top-0 lg:justify-start lg:gap-3 lg:aspect-auto lg:h-[250px] lg:w-[290px]">
            <p className={big}>{STATS.courses}</p>
            <Label>PAU courses with their slides already loaded</Label>
          </div>
        </div>
      </div>
    </section>
  );
}
