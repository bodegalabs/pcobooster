"use client";

import type { PeopleDashboardPerson } from "@worship-admin/contracts/people-schemas";
import { ChevronRight } from "lucide-react";

import { loadBadge } from "@/components/people/calendar";
import { PersonAvatar } from "@/components/people/shared-components";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

interface RosterTableBodyProps {
  visiblePeople: PeopleDashboardPerson[];
  isLoading: boolean;
  onPreviewPerson: (person: PeopleDashboardPerson) => void;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const RosterTableBody = ({
  visiblePeople,
  isLoading,
  onPreviewPerson,
  onOpenPerson,
}: RosterTableBodyProps) => {
  if (isLoading) {
    return (
      <TableBody>
        {Array.from({ length: 6 }).map((_, index) => (
          <TableRow key={`loading-${index}`}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Skeleton className="size-8" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Skeleton className="h-3.5 w-12" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3.5 w-12" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3.5 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3.5 w-6" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-3.5 w-24" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    );
  }

  if (visiblePeople.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={6} className="text-center">
            No people matched the current filters.
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <TableBody>
      {visiblePeople.map((person) => {
        const badge = loadBadge(person.load);
        return (
          <TableRow
            key={person.id}
            className="group/row cursor-pointer"
            onPointerEnter={() => {
              onPreviewPerson(person);
            }}
            onClick={() => {
              onOpenPerson(person);
            }}
          >
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar person={person} />
                <div className="min-w-0">
                  <button
                    type="button"
                    className="focus-visible:outline-ring block w-full truncate text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                    onFocus={() => {
                      onPreviewPerson(person);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenPerson(person);
                    }}
                  >
                    {person.name}
                  </button>
                  <p className="text-muted-foreground truncate text-xs">
                    {person.teams.join(", ")} · {person.roles}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span className={badge.className}>{badge.label}</span>
            </TableCell>
            <TableCell>{person.lastServed}</TableCell>
            <TableCell>{person.nextScheduled}</TableCell>
            <TableCell>{person.monthCount}</TableCell>
            <TableCell>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground truncate text-sm">
                  {person.status}
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100" />
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
};
