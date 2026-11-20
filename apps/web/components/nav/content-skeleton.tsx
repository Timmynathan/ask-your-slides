// What the content area shows while a page loads (owner, 21 Nov 2026): soft placeholder blocks,
// never a blank white screen. The sidebar around it stays as it is.
export function ContentSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 pt-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 rounded-lg bg-sunken" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-sunken/80" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-36 rounded-[22px] bg-sunken" />
        ))}
      </div>
    </div>
  );
}

/** First load only, before the sidebar's data arrives: the rail and panel as quiet blocks. */
export function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-page">
      <div className="fixed inset-y-0 left-0 hidden md:flex" aria-hidden>
        <div className="w-16 bg-pau-900" />
        <div className="w-[252px] bg-navy" />
      </div>
      <div className="md:pl-[316px]">
        <ContentSkeleton />
      </div>
    </div>
  );
}
