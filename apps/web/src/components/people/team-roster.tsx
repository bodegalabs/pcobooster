import type { PeopleDashboardRow } from "@pcobooster/client/people-dashboard";
import {
  describePersonSignal,
  formatDayKey,
  isRosterSignal,
} from "@pcobooster/client/team-health";
import type { PersonSignal } from "@pcobooster/client/team-health";
import type {
  PeopleDashboardPerson,
  PeopleDashboardRosterPerson,
} from "@pcobooster/contracts/people-schemas";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  PersonIdentitySkeleton,
  PersonLineSkeleton,
} from "@/components/people/people-skeletons";
import {
  PersonSignalBadge,
  PersonSignalIcon,
} from "@/components/people/person-signal";
import {
  Meter,
  PersonAvatar,
  PersonRowButton,
} from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";

type RosterSort = "name" | "lastServed" | "served90";

const sortLabels: Record<RosterSort, string> = {
  name: "Person",
  lastServed: "Last served",
  served90: "90 days",
};

/** Names A to Z in roster order (by last name); longest since serving first; busiest first. */
const sortDirection: Record<RosterSort, "ascending" | "descending"> = {
  name: "ascending",
  lastServed: "ascending",
  served90: "descending",
};

interface IndexedRow {
  row: PeopleDashboardRow;
  /** Roster order, which is by last name. */
  index: number;
}

const compareMembers = (
  sort: Exclude<RosterSort, "name">,
  a: PeopleDashboardPerson,
  b: PeopleDashboardPerson
) => {
  if (sort === "served90") {
    return b.rhythm.servedDays90 - a.rhythm.servedDays90;
  }
  // People who have not served sort first, then the longest since serving.
  return (a.rhythm.lastServedOn ?? "").localeCompare(
    b.rhythm.lastServedOn ?? ""
  );
};

const compareRows =
  (sort: RosterSort) =>
  (a: IndexedRow, b: IndexedRow): number => {
    if (sort === "name") {
      return a.index - b.index;
    }
    const { member: aMember } = a.row;
    const { member: bMember } = b.row;
    // People still loading keep roster order below everyone loaded.
    if (aMember === null || bMember === null) {
      if (aMember !== bMember) {
        return aMember === null ? 1 : -1;
      }
      return a.index - b.index;
    }
    return compareMembers(sort, aMember, bMember) || a.index - b.index;
  };

const SortHeader = ({
  sort,
  current,
  onSort,
  className,
}: {
  sort: RosterSort;
  current: RosterSort;
  onSort: (sort: RosterSort) => void;
  className?: string;
}) => {
  const active = sort === current;
  const direction = sortDirection[sort];
  return (
    <TableHead className={className} aria-sort={active ? direction : "none"}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => {
          onSort(sort);
        }}
      >
        {sortLabels[sort]}
        {active && direction === "ascending" ? (
          <ArrowUp aria-hidden data-icon="inline-end" />
        ) : null}
        {active && direction === "descending" ? (
          <ArrowDown aria-hidden data-icon="inline-end" />
        ) : null}
      </Button>
    </TableHead>
  );
};

const ServingBar = ({
  days,
  maxDays,
  teamPace,
}: {
  days: number;
  maxDays: number;
  teamPace: number | null;
}) => (
  <div className="flex items-center gap-2">
    <span className="w-5 shrink-0 text-right tabular-nums">{days}</span>
    <Meter
      value={maxDays === 0 ? 0 : days / maxDays}
      marker={teamPace === null || maxDays === 0 ? null : teamPace / maxDays}
      className="flex-1"
    />
  </div>
);

const SignalBadges = ({ signals }: { signals: readonly PersonSignal[] }) => {
  if (signals.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {signals.map((signal) => (
        <PersonSignalBadge key={signal.kind} signal={signal} />
      ))}
    </span>
  );
};

const responsesLabel = ({ rhythm }: PeopleDashboardPerson) => {
  const parts: string[] = [];
  if (rhythm.declined180 > 0) {
    parts.push(`${rhythm.declined180} declined`);
  }
  if (rhythm.pendingUpcoming > 0) {
    parts.push(`${rhythm.pendingUpcoming} pending`);
  }
  return parts.length > 0 ? parts.join(" · ") : "-";
};

/** What a cell shows before someone's activity arrives: a placeholder, or a dash if it won't. */
const NotLoaded = ({ loading }: { loading: boolean }) =>
  loading ? (
    <Skeleton variant="text" className="h-3 w-full max-w-16" />
  ) : (
    <span className="text-muted-foreground">-</span>
  );

const describeRoles = (
  person: PeopleDashboardRosterPerson,
  member: PeopleDashboardPerson | null
) => {
  const teams = person.teams.join(", ");
  if (member === null || member.roles.length === 0) {
    return teams;
  }
  const roles = member.roles.join(", ");
  return teams === "" ? roles : `${teams} · ${roles}`;
};

const COLUMN_COUNT = 6;
const NO_SIGNALS: readonly PersonSignal[] = [];

const rosterSignals = (
  signalsById: ReadonlyMap<string, readonly PersonSignal[]>,
  personId: string
) => (signalsById.get(personId) ?? NO_SIGNALS).filter(isRosterSignal);

interface TeamRosterProps {
  rows: readonly PeopleDashboardRow[];
  signalsById: ReadonlyMap<string, readonly PersonSignal[]>;
  teamPace: number | null;
  /** The roster itself has not loaded yet. */
  isLoading: boolean;
  empty: string;
  /** Below the rows, such as how many people are shown and a way to load more. */
  footer?: ReactNode;
  getPersonIntentProps: GetIntentPrefetchProps<PeopleDashboardRosterPerson>;
  onOpenPerson: (person: PeopleDashboardRosterPerson) => void;
}

/** Everyone in scope with how they have been serving and responding. */
export const TeamRoster = ({
  rows,
  signalsById,
  teamPace,
  isLoading,
  empty,
  footer,
  getPersonIntentProps,
  onOpenPerson,
}: TeamRosterProps) => {
  const [sort, setSort] = useState<RosterSort>("name");
  const sorted = useMemo(
    () =>
      rows
        .map((row, index) => ({ row, index }))
        .toSorted(compareRows(sort))
        .map(({ row }) => row),
    [rows, sort]
  );
  const maxDays = Math.max(
    0,
    ...rows.map((row) => row.member?.rhythm.servedDays90 ?? 0)
  );

  return (
    <div className="border-border/40 shrink-0 overflow-hidden rounded-2xl border md:rounded-lg">
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="[&>th]:h-9">
              <SortHeader
                sort="name"
                current={sort}
                onSort={setSort}
                className="w-[28%]"
              />
              <SortHeader
                sort="lastServed"
                current={sort}
                onSort={setSort}
                className="w-[13%]"
              />
              <TableHead className="w-[13%]">Next</TableHead>
              <SortHeader
                sort="served90"
                current={sort}
                onSort={setSort}
                className="w-[15%]"
              />
              <TableHead className="w-[14%]">Responses</TableHead>
              <TableHead>Signals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 6 }, (_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <PersonIdentitySkeleton index={index} />
                    </TableCell>
                    {Array.from({ length: COLUMN_COUNT - 1 }, (_cell, cell) => (
                      <TableCell key={cell}>
                        <NotLoaded loading />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
            {!isLoading && sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="text-center">
                  {empty}
                </TableCell>
              </TableRow>
            ) : null}
            {isLoading
              ? null
              : sorted.map(({ person, member, loading }) => (
                  <TableRow
                    key={person.id}
                    className="cursor-pointer"
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
                            {describeRoles(person, member)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    {member === null ? (
                      Array.from(
                        { length: COLUMN_COUNT - 1 },
                        (_cell, cell) => (
                          <TableCell key={cell}>
                            <NotLoaded loading={loading} />
                          </TableCell>
                        )
                      )
                    ) : (
                      <>
                        <TableCell>
                          {member.rhythm.lastServedOn === null
                            ? "6+ months"
                            : formatDayKey(member.rhythm.lastServedOn)}
                        </TableCell>
                        <TableCell>
                          {member.rhythm.nextServingOn === null ? (
                            <span className="text-muted-foreground">
                              Not scheduled
                            </span>
                          ) : (
                            formatDayKey(member.rhythm.nextServingOn)
                          )}
                        </TableCell>
                        <TableCell>
                          <ServingBar
                            days={member.rhythm.servedDays90}
                            maxDays={maxDays}
                            teamPace={teamPace}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground block truncate">
                            {responsesLabel(member)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <SignalBadges
                            signals={rosterSignals(signalsById, person.id)}
                          />
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      <div className="divide-border/35 flex flex-col divide-y p-1 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <PersonLineSkeleton key={index} index={index} />
            ))
          : null}
        {!isLoading && sorted.length === 0 ? (
          <p className="text-muted-foreground px-2 py-3 text-sm">{empty}</p>
        ) : null}
        {isLoading
          ? null
          : sorted.map(({ person, member }) => {
              const [firstSignal] =
                member === null ? [] : rosterSignals(signalsById, person.id);
              return (
                <PersonRowButton
                  key={person.id}
                  person={person}
                  getPersonIntentProps={getPersonIntentProps}
                  onOpenPerson={onOpenPerson}
                >
                  <PersonAvatar person={person} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {person.name}
                    </span>
                    {member === null ? (
                      // Teams come with the roster; dates follow once activity loads.
                      <span className="text-muted-foreground block truncate text-xs">
                        {person.teams.join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground block truncate text-xs">
                        {member.rhythm.lastServedOn === null
                          ? "No serving in 6 months"
                          : `Last ${formatDayKey(member.rhythm.lastServedOn)}`}
                        {" · "}
                        {member.rhythm.nextServingOn === null
                          ? "Not scheduled"
                          : `Next ${formatDayKey(member.rhythm.nextServingOn)}`}
                      </span>
                    )}
                  </span>
                  {firstSignal === undefined ? null : (
                    <Badge variant="outline" className="shrink-0">
                      <PersonSignalIcon signal={firstSignal} />
                      {describePersonSignal(firstSignal).label}
                    </Badge>
                  )}
                </PersonRowButton>
              );
            })}
      </div>
      {footer === undefined ? null : (
        <div className="border-border/40 text-muted-foreground flex flex-wrap items-center gap-x-1 border-t px-3 py-1.5 text-xs">
          {footer}
        </div>
      )}
    </div>
  );
};
