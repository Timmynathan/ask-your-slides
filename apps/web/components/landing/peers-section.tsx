// "What your peers are saying" (owner, 19 Nov 2026): social proof on the landing page. Videos from
// students and creators sit in one row; students' own words show as chat bubbles beside them (one
// video) or below them (two or more).
//
// Quotes: short lines approved by the owner for these students (19 Nov 2026). A bubble with an
// empty quote is not shown. Videos live in public/social/ (H.264 MP4, ~6 MB, with a WebP poster), and nothing
// downloads until a visitor presses play.
import { PeerVideo } from "./peer-video";

interface PeerVideoItem {
  src: string;
  poster: string;
  /** Read out by screen readers. */
  label: string;
}

interface PeerQuote {
  /** First name and initial, as the student agreed to be shown. */
  name: string;
  quote: string;
}

export const PEER_VIDEOS: PeerVideoItem[] = [
  { src: "/social/peer-1.mp4", poster: "/social/peer-1-poster.webp", label: "A PAU student revising with Ask Your Slides" },
];

export const PEER_QUOTES: PeerQuote[] = [
  { name: "Tobi A.", quote: "It shows me the exact slide. Saves me so much time." },
  { name: "David O.", quote: "Past questions with answers. Big help for exams." },
  { name: "Seyi O.", quote: "No more uploading slides to ChatGPT." },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

function Bubble({ name, quote }: PeerQuote) {
  return (
    <figure className="flex items-end gap-3">
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pau-100 text-[13px] font-semibold text-pau-800 dark:text-pau-400">
        {initials(name)}
      </span>
      <div className="min-w-0">
        <figcaption className="mb-1 ml-1 text-[13px] font-medium text-muted">{name}</figcaption>
        <blockquote className="rounded-[22px] rounded-bl-md bg-card px-4 py-3 text-[15px] leading-relaxed text-ink ring-1 ring-line">{quote}</blockquote>
      </div>
    </figure>
  );
}

export function PeersSection() {
  const quotes = PEER_QUOTES.filter((q) => q.quote.trim());
  const oneVideo = PEER_VIDEOS.length === 1;
  const videos = (
    <div className="flex flex-wrap justify-center gap-5">
      {PEER_VIDEOS.map((v) => (
        <PeerVideo key={v.src} {...v} />
      ))}
    </div>
  );

  return (
    <section id="peers" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-6xl px-5">
        <h2 className="text-center font-heading text-4xl font-semibold tracking-tight text-ink">What your peers are saying</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">PAU students revising for their exams with their own course slides.</p>
        {oneVideo && quotes.length > 0 ? (
          <div className="mx-auto mt-12 flex max-w-4xl flex-col items-center gap-10 md:flex-row md:items-center md:justify-center md:gap-14">
            {videos}
            <div className="flex w-full max-w-md flex-col gap-5">
              {quotes.map((q) => (
                <Bubble key={q.name} {...q} />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-12">{videos}</div>
            {quotes.length > 0 && (
              <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
                {quotes.map((q) => (
                  <Bubble key={q.name} {...q} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
