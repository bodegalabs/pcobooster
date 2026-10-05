import { describeCoverage } from "@pcobooster/client/people-dashboard";
import type { PeopleDashboardCoverage } from "@pcobooster/client/people-dashboard";

import { Button } from "@/components/ui/button";

const peopleCount = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"}`;

/** "Based on the first 48 of 230 people · Load more", or nothing once everyone is in. */
export const CoverageNote = ({
  coverage,
  isLoading,
  canLoadMore,
  onLoadMore,
}: {
  coverage: PeopleDashboardCoverage;
  isLoading: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
}) => {
  const text = describeCoverage(coverage, isLoading);
  if (text === null) {
    return null;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span>
        {text}
        {canLoadMore ? null : "."}
      </span>
      {canLoadMore ? (
        <Button variant="link" size="xs" onClick={onLoadMore}>
          Load more
        </Button>
      ) : null}
    </span>
  );
};

interface PeopleDashboardProgressProps {
  coverage: PeopleDashboardCoverage | undefined;
  isLoadingActivity: boolean;
  failedBatchCount: number;
  onRetry: () => void;
}

/** Schedules still loading, or a retry when some failed. */
export const PeopleDashboardProgress = ({
  coverage,
  isLoadingActivity,
  failedBatchCount,
  onRetry,
}: PeopleDashboardProgressProps) => {
  if (
    coverage === undefined ||
    (!isLoadingActivity && failedBatchCount === 0)
  ) {
    return null;
  }
  const sampleLoading = coverage.loadedPeopleCount < coverage.samplePeopleCount;
  return (
    <div
      className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      aria-live="polite"
    >
      {failedBatchCount > 0 ? (
        <>
          <span className="text-destructive">
            Some schedules failed to load.
          </span>
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry
          </Button>
        </>
      ) : (
        <span className="tabular-nums">
          {sampleLoading
            ? `Loading schedules · ${coverage.loadedPeopleCount} of ${peopleCount(coverage.samplePeopleCount)}`
            : "Loading schedules"}
        </span>
      )}
    </div>
  );
};
