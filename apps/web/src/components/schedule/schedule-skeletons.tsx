import { ItemList } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";

/** Varied widths keep stacked skeleton rows from reading as a barcode. */
const candidateNameWidths = ["8rem", "10rem", "7rem", "9rem", "6rem", "11rem"];

export const PlanHeaderSkeleton = () => (
  <header className="mb-3 shrink-0 sm:mb-5">
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:h-7 sm:flex-row sm:items-center sm:gap-3 md:h-8">
        <Skeleton variant="control" className="h-5 w-56 max-w-full sm:h-6" />
        <Skeleton variant="control" className="h-4 w-36 sm:h-6 sm:w-44" />
      </div>
      <Skeleton variant="control" className="size-7 shrink-0" />
    </div>
  </header>
);

export const CandidateListSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <ItemList>
    {Array.from({ length: rows }, (_, index) => (
      <div
        key={index}
        className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-4 sm:py-3"
      >
        <Skeleton variant="round" className="size-8 shrink-0" />
        <Skeleton
          variant="text"
          className="h-3.5"
          width={candidateNameWidths[index % candidateNameWidths.length]}
        />
        <div className="ml-auto hidden w-28 flex-col items-end gap-1.5 sm:flex">
          <Skeleton variant="text" className="h-3 w-10" />
          <Skeleton variant="round" className="h-1.5 w-full" />
        </div>
        <Skeleton
          variant="control"
          className="ml-auto h-8 w-9 shrink-0 sm:ml-0 sm:w-20"
        />
      </div>
    ))}
  </ItemList>
);
