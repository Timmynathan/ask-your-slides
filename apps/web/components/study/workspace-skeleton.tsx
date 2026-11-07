// First-load placeholder in the shape of the workspace, so the screen never flashes blank.
export function WorkspaceSkeleton() {
  const bar = "rounded bg-neutral-200/80 dark:bg-neutral-800";
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white dark:bg-neutral-950" aria-busy="true" aria-label="Loading">
      <div className="hidden w-[288px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 lg:flex">
        <div className="flex h-14 items-center border-b border-neutral-200 px-4 dark:border-neutral-800">
          <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Ask Your Slides</span>
        </div>
        <div className="space-y-4 px-4 py-4">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex animate-pulse gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
              <div className="flex-1 space-y-1.5">
                <div className={`h-3 w-16 ${bar}`} />
                <div className={`h-2.5 w-40 ${bar}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-neutral-200 px-4 dark:border-neutral-800">
          <div className={`h-3.5 w-56 animate-pulse ${bar}`} />
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );
}
