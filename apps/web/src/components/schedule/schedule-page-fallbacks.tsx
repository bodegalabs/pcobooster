import {
  CandidateListSkeleton,
  PlanHeaderSkeleton,
  PositionPickerSkeleton,
} from "@/components/schedule/schedule-skeletons";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const planRowWidths = [
  ["11rem", "7rem", "1.5rem", "6rem"],
  ["9rem", "7rem", "1.5rem", "5rem"],
  ["7rem", "7rem", "1.5rem", "10rem"],
  ["10rem", "7rem", "1.5rem", "8rem"],
  ["6rem", "7rem", "1.5rem", "7rem"],
];

/** Mirrors the services selector: filters, then the plan table with real headers. */
export const SchedulePlansFallback = () => (
  <main
    className="bg-background flex h-full min-h-0 flex-col overflow-hidden"
    aria-busy
    aria-label="Loading services"
  >
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
      <section className="flex shrink-0 flex-col gap-2.5">
        <Skeleton variant="text" className="h-3 w-24" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="hidden h-24 w-full sm:block" />
          <Skeleton className="hidden h-24 w-full lg:block" />
        </div>
        <Separator className="mt-1" />
      </section>
      <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
        <Skeleton variant="round" className="h-9" />
        <Skeleton variant="round" className="h-9" />
        <Skeleton variant="round" className="h-9" />
      </div>
      <div className="border-border/40 min-h-0 flex-1 overflow-hidden rounded-lg border">
        <div className="text-foreground border-border/40 hidden h-9 grid-cols-[30%_20%_25%_minmax(0,1fr)] items-center border-b px-3 text-sm font-medium md:grid">
          <span>Service type</span>
          <span>Date</span>
          <span>Series</span>
          <span>Plan</span>
        </div>
        <div className="divide-border/35 divide-y">
          {Array.from({ length: 12 }, (_, index) => {
            const widths = planRowWidths[index % planRowWidths.length];
            return (
              <div
                key={index}
                className="grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 md:grid-cols-[30%_20%_25%_minmax(0,1fr)] md:gap-0"
              >
                <Skeleton variant="text" className="h-3" width={widths[0]} />
                <Skeleton
                  variant="text"
                  className="hidden h-3 md:block"
                  width={widths[1]}
                />
                <Skeleton variant="text" className="h-3" width={widths[2]} />
                <Skeleton
                  variant="text"
                  className="hidden h-3 md:block"
                  width={widths[3]}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </main>
);

export const SchedulePlanWorkspaceFallback = () => (
  <main
    className="bg-background flex h-full min-h-0 flex-col overflow-hidden"
    aria-busy
    aria-label="Loading plan"
  >
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-3 py-2 sm:px-4 sm:py-3">
      <PlanHeaderSkeleton />

      <div className="flex min-h-0 w-full flex-1 flex-col gap-3 sm:gap-4 lg:flex-row">
        <aside className="border-sidebar-border/40 bg-sidebar/60 hidden min-h-0 w-[min(18rem,28vw)] shrink-0 overflow-hidden rounded-xl border lg:block">
          <PositionPickerSkeleton />
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2 px-1 sm:gap-3">
            <Skeleton variant="control" className="h-6 w-40 sm:h-7" />
            <Skeleton variant="round" className="h-8 w-full sm:max-w-sm" />
          </div>
          <CandidateListSkeleton />
        </section>
      </div>
    </div>
  </main>
);
