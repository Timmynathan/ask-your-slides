import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import { AutoRefresh } from "@/components/live/auto-refresh";
import { liveCount, liveTokenOk } from "@/lib/live-count";

export const metadata: Metadata = { title: "Live count · Ask Your Slides", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

// Public, read-only, for the campus ambassadors: the link itself is the key (LIVE_COUNT_TOKEN).
// Counts only. Refreshes itself every 30 seconds.
async function Loaded({ params }: Props) {
  const { token } = await params;
  if (!liveTokenOk(token)) notFound();
  const c = await liveCount();
  const top = Math.max(1, ...c.departments.map((d) => d.n));
  return (
    <div className="min-h-dvh bg-page text-ink">
      <AutoRefresh seconds={30} />
      <main className="mx-auto max-w-xl px-5 pb-16 pt-8">
        <header className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[15px]">
            <LogoMark size={20} />
            Ask Your Slides
          </span>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live · {timeFmt.format(new Date(c.at))}
          </span>
        </header>

        <section className="mt-16 text-center">
          <p className="text-[15px] text-muted">Students signed up</p>
          <p className="mt-2 font-heading text-[clamp(96px,30vw,168px)] font-semibold leading-none tracking-[-0.04em] tabular-nums text-brand">
            {c.signedUp.toLocaleString("en-GB")}
          </p>
        </section>

        <section className="mt-16">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">By department</h2>
          <ul className="mt-4 divide-y divide-line">
            {c.departments.map((d) => (
              <li key={d.name} className="py-3.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className={`text-[16px] ${d.n ? "" : "text-muted"}`}>{d.name}</span>
                  <span className={`text-[20px] font-semibold tabular-nums ${d.n ? "" : "text-muted"}`}>{d.n}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(100 * d.n) / top}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {c.settingUp > 0 && (
            <p className="mt-4 text-[13px] text-muted">
              {c.settingUp} {c.settingUp === 1 ? "student has" : "students have"} not picked a programme yet.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default function LivePage(props: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
