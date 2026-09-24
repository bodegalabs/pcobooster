import { Skeleton } from "@/components/ui/skeleton";

const nameWidths = ["8rem", "6rem", "9rem", "7rem", "10rem", "5rem"];
const detailWidths = ["11rem", "9rem", "12rem", "8rem", "10rem", "7rem"];

/** Avatar plus two text lines, matching the people list identity cell. */
export const PersonIdentitySkeleton = ({
  index,
  showAvatar = true,
}: {
  index: number;
  showAvatar?: boolean;
}) => (
  <div className="flex min-w-0 items-center gap-3">
    {showAvatar ? (
      <Skeleton variant="round" className="size-8 shrink-0" />
    ) : null}
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Skeleton
        variant="text"
        className="h-3.5 max-w-full"
        width={nameWidths[index % nameWidths.length]}
      />
      <Skeleton
        variant="text"
        className="h-3 max-w-full"
        width={detailWidths[index % detailWidths.length]}
      />
    </div>
  </div>
);

export const PersonLineSkeleton = ({
  index,
  showAvatar,
}: {
  index: number;
  showAvatar?: boolean;
}) => (
  <div className="px-2 py-1.5">
    <PersonIdentitySkeleton index={index} showAvatar={showAvatar} />
  </div>
);

export const PersonLineSkeletonList = ({
  rows,
  showAvatar,
}: {
  rows: number;
  showAvatar?: boolean;
}) => (
  <div className="flex flex-col">
    {Array.from({ length: rows }, (_, index) => (
      <PersonLineSkeleton key={index} index={index} showAvatar={showAvatar} />
    ))}
  </div>
);

/** Route fallback while the People page's code loads. */
export const PeoplePageSkeleton = () => (
  <main className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
    <div
      className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-3 px-4 pt-1 md:py-4"
      aria-busy
      aria-label="Loading people"
    >
      <div className="flex flex-col gap-2 max-md:hidden">
        <Skeleton variant="control" className="h-7 w-28" />
        <Skeleton variant="text" className="h-3.5 w-80 max-w-full" />
      </div>
      <Skeleton variant="control" className="h-9 w-full" />
      <PersonLineSkeletonList rows={8} />
    </div>
  </main>
);
