import type { PeopleDashboardPerson } from "@pcobooster/contracts/people-schemas";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { loadBadge } from "@/components/people/calendar";
import { PersonIdentitySkeleton } from "@/components/people/people-skeletons";
import { PersonAvatar } from "@/components/people/shared-components";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";

interface RosterTableBodyProps {
  visiblePeople: PeopleDashboardPerson[];
  isLoading: boolean;
  getPersonIntentProps: GetIntentPrefetchProps<PeopleDashboardPerson>;
  onOpenPerson: (person: PeopleDashboardPerson) => void;
}

export const RosterTableBody = ({
  visiblePeople,
  isLoading,
  getPersonIntentProps,
  onOpenPerson,
}: RosterTableBodyProps) => {
  if (isLoading) {
    return (
      <TableBody>
        {Array.from({ length: 6 }, (_, index) => (
          <TableRow key={index}>
            <TableCell>
              <PersonIdentitySkeleton index={index} />
            </TableCell>
            <TableCell>
              <Skeleton variant="round" className="h-5 w-full max-w-14" />
            </TableCell>
            <TableCell>
              <Skeleton variant="text" className="h-3 w-full max-w-12" />
            </TableCell>
            <TableCell>
              <Skeleton variant="text" className="h-3 w-full max-w-12" />
            </TableCell>
            <TableCell>
              <Skeleton variant="text" className="h-3 w-5" />
            </TableCell>
            <TableCell>
              <Skeleton variant="text" className="h-3 w-full max-w-20" />
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
            {...getPersonIntentProps(person)}
            onClick={() => {
              onOpenPerson(person);
            }}
          >
            <TableCell>
              <div className="flex min-w-0 items-center gap-3">
                <PersonAvatar person={person} />
                <div className="min-w-0">
                  <Link
                    to="/people/$personId"
                    params={{ personId: person.id }}
                    className="focus-visible:outline-ring block w-full truncate text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    {person.name}
                  </Link>
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
                <ChevronRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 pointer-coarse:opacity-100" />
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
};
