import { Fragment } from "react";

import { SidebarSeparator } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

/** Varied widths keep stacked skeleton rows from reading as a barcode. */
const candidateNameWidths = ["8rem", "10rem", "7rem", "9rem", "6rem", "11rem"];
const positionTeams = [
  { key: "a", teamWidth: "8rem", positionWidths: ["7rem"] },
  { key: "b", teamWidth: "5rem", positionWidths: ["6rem", "8rem"] },
  { key: "c", teamWidth: "7rem", positionWidths: ["7rem"] },
  { key: "d", teamWidth: "6rem", positionWidths: ["5rem", "7rem"] },
];

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

export const PositionPickerSkeleton = () => (
  <div className="flex flex-col py-1">
    {positionTeams.map((team, index) => (
      <Fragment key={team.key}>
        {index > 0 ? <SidebarSeparator className="my-0" /> : null}
        <div className="flex flex-col gap-1 p-2">
          <div className="flex h-8 items-center justify-between px-2">
            <Skeleton variant="text" className="h-3" width={team.teamWidth} />
            <Skeleton variant="round" className="size-3" />
          </div>
          {team.positionWidths.map((width) => (
            <div key={width} className="flex h-8 items-center gap-2 px-2">
              <Skeleton variant="text" className="size-4" />
              <Skeleton variant="text" className="h-3.5" width={width} />
            </div>
          ))}
        </div>
      </Fragment>
    ))}
  </div>
);

export const CandidateListSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="border-border/40 bg-card/30 divide-border/25 divide-y overflow-hidden rounded-xl border">
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
  </div>
);
