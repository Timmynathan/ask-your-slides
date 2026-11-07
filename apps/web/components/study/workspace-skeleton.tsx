// First-load placeholder in the shape of the workspace, so the screen never flashes blank.
export function WorkspaceSkeleton() {
  const bar = "rounded bg-sunken";
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-card" aria-busy="true" aria-label="Loading">
      <div className="hidden w-[304px] shrink-0 flex-col border-r border-line bg-page lg:flex">
        <div className="flex h-14 items-center border-b border-line px-4">
          <span className="text-sm font-semibold tracking-tight text-ink">Ask Your Slides</span>
        </div>
        <div className="space-y-4 px-4 py-4">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex animate-pulse gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-line-strong" />
              <div className="flex-1 space-y-1.5">
                <div className={`h-3 w-16 ${bar}`} />
                <div className={`h-2.5 w-40 ${bar}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-line px-4">
          <div className={`h-3.5 w-56 animate-pulse ${bar}`} />
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );
}
