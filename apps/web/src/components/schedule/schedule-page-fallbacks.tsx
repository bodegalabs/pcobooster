import { Skeleton } from "@/components/ui/skeleton";

export const SchedulePlansFallback = () => (
  <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
      <div className="border-border/40 min-h-0 flex-1 overflow-hidden rounded-lg border">
        <div className="border-border/40 grid grid-cols-[1.2fr_0.8fr_1fr_1fr] border-b px-5 py-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <div className="divide-border/35 divide-y">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr] px-5 py-3"
            >
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </main>
);

export const SchedulePlanWorkspaceFallback = () => (
  <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 py-2 sm:px-4 sm:py-3">
      <header className="mb-3 shrink-0 sm:mb-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-80 max-w-full" />
            <Skeleton className="mt-2 h-4 w-44" />
          </div>
          <Skeleton className="size-8" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] gap-4">
        <aside className="border-sidebar-border/40 bg-sidebar/60 hidden min-h-0 overflow-hidden rounded-xl border p-3 lg:block">
          <div className="grid gap-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="grid gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            ))}
          </div>
        </aside>
        <section className="border-border/40 bg-card/30 min-h-0 overflow-hidden rounded-xl border">
          <div className="border-border/40 border-b px-4 py-3">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
          <div className="divide-border/25 divide-y">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="mt-2 h-3 w-56" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  </main>
);
