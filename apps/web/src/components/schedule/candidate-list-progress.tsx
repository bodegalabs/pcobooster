import { Button } from "@/components/ui/button";
import type { CandidateListProgress as Progress } from "@/lib/position-candidates";

interface CandidateListProgressProps {
  progress: Progress | undefined;
  isEnriching: boolean;
  failedPartCount: number;
  onRetry: () => void;
}

const describeProgress = ({
  candidateCount,
  detailedCount,
  historyLoaded,
}: Progress): string => {
  const history = historyLoaded ? "Serving history loaded" : "Loading history";
  return `${history}; availability for ${detailedCount} of ${candidateCount} people.`;
};

/** How much of the candidate list's history and availability has arrived, with retry. */
export const CandidateListProgress = ({
  progress,
  isEnriching,
  failedPartCount,
  onRetry,
}: CandidateListProgressProps) => {
  if (!progress || (!isEnriching && failedPartCount === 0)) {
    return null;
  }
  return (
    <div
      className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      aria-live="polite"
    >
      {isEnriching ? (
        <span className="tabular-nums">{describeProgress(progress)}</span>
      ) : null}
      {failedPartCount > 0 ? (
        <>
          <span className="text-destructive">
            Some history or availability failed to load.
          </span>
          <Button variant="outline" size="xs" onClick={onRetry}>
            Retry
          </Button>
        </>
      ) : null}
    </div>
  );
};
