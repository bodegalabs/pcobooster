import {
  describeDue,
  describePersonSignal,
  formatWeekdayDayKey,
} from "@pcobooster/client/team-health";
import type {
  CheckIn,
  DueForSlot,
  PersonSignal,
  WaitingOnReply,
} from "@pcobooster/client/team-health";
import type { PeopleDashboardRosterPerson } from "@pcobooster/contracts/people-schemas";
import { CalendarClock, HeartHandshake, MailQuestionMark } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { PersonLineSkeletonList } from "@/components/people/people-skeletons";
import { PersonSignalIcon } from "@/components/people/person-signal";
import {
  Meter,
  PersonAvatar,
  PersonRowButton,
} from "@/components/people/shared-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { GetIntentPrefetchProps } from "@/hooks/use-intent-prefetch";

/** The due list's gap bars share one scale: the six months serving history covers. */
const GAP_SCALE_DAYS = 180;

/** Rows each list shows before "Show all". */
const COLLAPSED_ROWS = 6;

/** Whether a list's people have loaded: none yet, some, or all. */
export type ListProgress = "loading" | "partial" | "complete";

interface PersonListCallbacks {
  getPersonIntentProps: GetIntentPrefetchProps<PeopleDashboardRosterPerson>;
  onOpenPerson: (person: PeopleDashboardRosterPerson) => void;
}

interface PersonListProps<Entry> extends PersonListCallbacks {
  entries: readonly Entry[];
  progress: ListProgress;
  empty: string;
  personOf: (entry: Entry) => PeopleDashboardRosterPerson;
  renderDetail: (entry: Entry) => ReactNode;
  renderAside?: (entry: Entry) => ReactNode;
}

const PersonList = <Entry,>({
  entries,
  progress,
  empty,
  personOf,
  renderDetail,
  renderAside,
  getPersonIntentProps,
  onOpenPerson,
}: PersonListProps<Entry>) => {
  const [expanded, setExpanded] = useState(false);
  if (progress === "loading") {
    return <PersonLineSkeletonList rows={3} />;
  }
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground px-1.5 py-1 text-sm">
        {progress === "partial" ? "No one so far." : empty}
      </p>
    );
  }
  const shown = expanded ? entries : entries.slice(0, COLLAPSED_ROWS);
  return (
    <div className="flex flex-col">
      {shown.map((entry) => {
        const person = personOf(entry);
        return (
          <PersonRowButton
            key={person.id}
            person={person}
            getPersonIntentProps={getPersonIntentProps}
            onOpenPerson={onOpenPerson}
            size="row"
          >
            <PersonAvatar person={person} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {person.name}
              </span>
              <span className="text-muted-foreground block truncate text-xs">
                {renderDetail(entry)}
              </span>
            </span>
            {renderAside ? (
              <span className="flex shrink-0 items-center gap-1">
                {renderAside(entry)}
              </span>
            ) : null}
          </PersonRowButton>
        );
      })}
      {entries.length > COLLAPSED_ROWS ? (
        <Button
          variant="ghost"
          size="xs"
          className="mt-1 self-start"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "Show fewer" : `Show all ${entries.length}`}
        </Button>
      ) : null}
    </div>
  );
};

const ListCard = ({
  icon,
  title,
  description,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  /** Shown once the list has loaded anyone. */
  count: number | null;
  children: ReactNode;
}) => (
  <Card size="sm">
    <CardHeader>
      <CardTitle>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden>
            {icon}
          </span>
          {title}
        </span>
      </CardTitle>
      <CardDescription>{description}</CardDescription>
      {count !== null && count > 0 ? (
        <CardAction>
          <Badge variant="secondary">{count}</Badge>
        </CardAction>
      ) : null}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

interface TeamListProps<Entry> extends PersonListCallbacks {
  entries: readonly Entry[];
  progress: ListProgress;
}

/** People who have not answered a request for the coming week. */
export const WaitingOnReplyList = ({
  entries,
  progress,
  ...callbacks
}: TeamListProps<WaitingOnReply>) => (
  <ListCard
    icon={<MailQuestionMark className="size-4" />}
    title="Waiting on a reply"
    description="Unanswered requests in the next 7 days."
    count={progress === "loading" ? null : entries.length}
  >
    <PersonList
      entries={entries}
      progress={progress}
      empty="Everyone has answered this week's requests."
      personOf={(entry) => entry.member}
      renderDetail={(entry) =>
        entry.member.roles.length > 0
          ? entry.member.roles.join(", ")
          : entry.member.teams.join(", ")
      }
      renderAside={({ nextPendingOn, pending }) => (
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatWeekdayDayKey(nextPendingOn)}
          {pending > 1 ? ` +${pending - 1}` : null}
        </span>
      )}
      {...callbacks}
    />
  </ListCard>
);

/** People a leader may want to reach out to, with the reasons why. */
export const TeamCheckIns = ({
  entries,
  progress,
  ...callbacks
}: TeamListProps<CheckIn>) => (
  <ListCard
    icon={<HeartHandshake className="size-4" />}
    title="Check in"
    description="Declining, drifting, or carrying a heavy load."
    count={progress === "loading" ? null : entries.length}
  >
    <PersonList
      entries={entries}
      progress={progress}
      empty="Nobody needs a check-in right now."
      personOf={(checkIn) => checkIn.member}
      renderDetail={({ reasons }) =>
        reasons
          .map((reason: PersonSignal) => describePersonSignal(reason).detail)
          .join(" ")
      }
      renderAside={({ reasons: [primary, ...others] }) =>
        primary === undefined ? null : (
          <>
            <Badge variant="outline">
              <PersonSignalIcon signal={primary} />
              {describePersonSignal(primary).label}
            </Badge>
            {others.length > 0 ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                +{others.length}
              </span>
            ) : null}
          </>
        )
      }
      {...callbacks}
    />
  </ListCard>
);

/** People with nothing scheduled who are past their usual gap between serves. */
export const TeamDueList = ({
  entries,
  progress,
  ...callbacks
}: TeamListProps<DueForSlot>) => (
  <ListCard
    icon={<CalendarClock className="size-4" />}
    title="Due for a slot"
    description="Nothing scheduled and past their usual gap."
    count={progress === "loading" ? null : entries.length}
  >
    <PersonList
      entries={entries}
      progress={progress}
      empty="Everyone has served recently or has something scheduled."
      personOf={(due) => due.member}
      renderDetail={describeDue}
      renderAside={({ member, daysSinceServed, typicalGapDays }) => (
        <span className="flex w-20 flex-col items-end gap-1.5 sm:w-24">
          <span className="text-muted-foreground max-w-full truncate text-xs">
            {member.roles.length > 0
              ? member.roles.join(", ")
              : member.teams.join(", ")}
          </span>
          <Meter
            value={(daysSinceServed ?? GAP_SCALE_DAYS) / GAP_SCALE_DAYS}
            marker={
              typicalGapDays === null ? null : typicalGapDays / GAP_SCALE_DAYS
            }
            tone={daysSinceServed === null ? "negative" : "attention"}
            className="w-full"
          />
        </span>
      )}
      {...callbacks}
    />
  </ListCard>
);
