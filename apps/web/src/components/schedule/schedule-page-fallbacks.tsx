import {
  CandidateListSkeleton,
  PlanHeaderSkeleton,
  PositionPickerSkeleton,
} from "@/components/schedule/schedule-skeletons";
import { PlanAgendaSkeleton } from "@/components/service-plan-table-selector";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the services selector: your services, filters, then the plan agenda. */
export const SchedulePlansFallback = () => (
  <main
    className="bg-background flex flex-1 flex-col md:h-full md:min-h-0 md:overflow-hidden"
    aria-busy
    aria-label="Loading services"
  >
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 px-4 pt-1 md:py-4">
      <section className="flex shrink-0 flex-col gap-2.5">
        <Skeleton variant="text" className="h-3 w-24" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-[5.25rem] w-full" />
          <Skeleton className="hidden h-[5.25rem] w-full sm:block" />
          <Skeleton className="hidden h-[5.25rem] w-full lg:block" />
        </div>
      </section>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 grid-cols-2 gap-2 py-2 md:grid-cols-[minmax(0,1fr)_180px_160px] md:pt-0 md:pb-1">
          <Skeleton variant="round" className="col-span-2 h-9 md:col-span-1" />
          <Skeleton variant="round" className="h-9" />
          <Skeleton variant="round" className="h-9" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <PlanAgendaSkeleton />
        </div>
      </div>
    </div>
  </main>
);

export const SchedulePlanWorkspaceFallback = () => (
  <main
    className="bg-background flex flex-1 flex-col md:h-full md:min-h-0 md:overflow-hidden"
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
