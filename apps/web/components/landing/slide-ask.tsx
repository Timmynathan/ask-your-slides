// "Ask about anything on a slide": a lecture slide in the style of the PAU decks (navy title band,
// bullets) with our own sample content, an AI highlight sweeping over a phrase, and the study
// partner answering with a citation. Not a real lecturer's slide: course slides are only shown to
// signed-in students (PRD §16), never on the public page. CSS loop: globals.css .hl-sweep/.ai-pop.
import { Mascot } from "@/components/mascot/mascot";

export function SlideAsk() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]" aria-hidden>
      {/* the slide */}
      <div className="overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/10">
        <div className="bg-[#0b1b4d] px-6 py-4 text-center font-[Calibri,Carlito,'Segoe_UI',sans-serif] text-[22px] font-bold text-white">
          Indexing: Why Are Indexes So Popular?
        </div>
        <div className="space-y-3 px-6 py-5 font-[Calibri,Carlito,'Segoe_UI',sans-serif] text-[15px] leading-snug text-[#0b1b4d]">
          <p>
            ▪ Without an index, the DBMS must scan <b>every row</b> of the table.
          </p>
          <p>
            ▪ A <span className="hl-sweep rounded px-0.5 font-bold">B+ tree index</span> keeps keys <b>sorted</b>, so lookups take
            O(log n) instead of O(n).
          </p>
          <p>▪ Leaves are linked, so <b>range queries</b> walk them in order.</p>
          {/* tiny tree diagram */}
          <svg viewBox="0 0 220 70" className="mx-auto mt-1 w-56" fill="none" stroke="#0b1b4d" strokeWidth="1.6">
            <rect x="92" y="4" width="36" height="16" rx="3" />
            <path d="M100 20 L46 40 M110 20 L110 40 M120 20 L174 40" />
            <rect x="24" y="40" width="44" height="16" rx="3" />
            <rect x="88" y="40" width="44" height="16" rx="3" />
            <rect x="152" y="40" width="44" height="16" rx="3" />
            <path d="M68 48 h20 M132 48 h20" strokeDasharray="3 3" />
          </svg>
          <p className="pt-1 text-right text-[11px] text-[#0b1b4d]/60">Data Management II · 21</p>
        </div>
      </div>

      {/* the partner answers */}
      <div className="ai-pop absolute -bottom-10 right-[-6%] flex w-[78%] items-start gap-2.5 sm:right-[-10%]">
        <Mascot partner="ada" size={44} mood="happy" />
        <div className="rounded-2xl rounded-tl-md bg-white p-3 text-left text-[13px] leading-relaxed text-[#191919] shadow-lg ring-1 ring-black/5">
          A B+ tree keeps keys sorted, so the database finds rows in a few steps instead of scanning them all.{" "}
          <span className="whitespace-nowrap rounded-full bg-teal-50 px-2 py-0.5 text-[10.5px] font-medium text-teal-800 ring-1 ring-teal-200">
            Indexing · Slide 21
          </span>
        </div>
      </div>
    </div>
  );
}
