// First-load placeholder in the shape of the workspace (top bar; Topics | chat panels), so the
// screen never flashes blank.
export function WorkspaceSkeleton() {
  const bar = "rounded bg-sunken";
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-tint" aria-busy="true" aria-label="Loading">
      <div className="flex h-16 shrink-0 items-center gap-3 px-5">
        <span className="h-10 w-10 rounded-full bg-card ring-1 ring-line" />
        <div className="space-y-1.5">
          <div className={`h-4 w-64 animate-pulse ${bar}`} />
          <div className={`h-2.5 w-32 animate-pulse ${bar}`} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 lg:px-3 lg:pb-3">
        <div className="hidden w-[300px] shrink-0 flex-col gap-3 rounded-[24px] bg-card p-4 ring-1 ring-line lg:flex">
          <div className={`h-4 w-16 ${bar}`} />
          <div className="h-10 rounded-full bg-sunken" />
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 px-1">
              <span className="h-5 w-5 rounded-md bg-sunken" />
              <div className={`h-3 flex-1 ${bar}`} />
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col bg-card lg:rounded-[24px] lg:ring-1 lg:ring-line">
          <div className="flex h-12 items-center border-b border-line px-5">
            <div className={`h-3 w-40 animate-pulse ${bar}`} />
          </div>
          <div className="flex-1" />
        </div>
      </div>
    </div>
  );
}
