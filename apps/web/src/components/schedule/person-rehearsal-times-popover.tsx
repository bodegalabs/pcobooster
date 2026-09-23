"use client";

import { formatWallTimeInTimeZone } from "@pcobooster/planning-center-models/calendar";
import type {
  FilledPositionPerson,
  PlanTime,
} from "@pcobooster/planning-center-models/types";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock3 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { formatPlanTimeRangeLabel } from "@/components/schedule/plan-time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { MiddleTruncate } from "@/components/ui/middle-truncate";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { useDraftPopover } from "@/hooks/use-persist-on-close-popover";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { orpc } from "@/orpc-client";

interface PersonRehearsalTimesPopoverProps {
  person: FilledPositionPerson;
  planTimes: PlanTime[];
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  display?: "default" | "lineup";
}

const formatPlanTimeScheduleLabel = (
  planTime: PlanTime,
  timeZone: string
): string => {
  const starts = formatWallTimeInTimeZone(planTime.startsAt, timeZone);
  const ends = planTime.endsAt
    ? formatWallTimeInTimeZone(planTime.endsAt, timeZone)
    : null;

  return formatPlanTimeRangeLabel({
    startDate: starts.dateKey,
    startTime: starts.timeValue,
    endDate: ends?.dateKey ?? starts.dateKey,
    endTime: ends?.timeValue ?? "",
  });
};

const haveSameIds = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const aSet = new Set(a);
  return b.every((id) => aSet.has(id));
};

const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

export const PersonRehearsalTimesPopover = ({
  person,
  planTimes,
  serviceTypeId,
  planId,
  seriesId,
  display = "default",
}: PersonRehearsalTimesPopoverProps) => {
  const queryClient = useQueryClient();
  const timeZone = useOrganizationTimeZone();
  const assignedTimeIds = person.assignedTimeIds ?? [];
  const editablePlanTimeIds = useMemo(
    () => planTimes.map((planTime) => planTime.id),
    [planTimes]
  );
  const canEdit =
    serviceTypeId !== null &&
    serviceTypeId !== "" &&
    planId !== null &&
    planId !== "" &&
    person.personId !== null &&
    person.personId !== undefined &&
    person.personId !== "" &&
    planTimes.length > 0;

  const persist = async (timeIds: string[]) => {
    if (
      !(serviceTypeId !== null && serviceTypeId !== "") ||
      !(planId !== null && planId !== "") ||
      !(
        person.personId !== null &&
        person.personId !== undefined &&
        person.personId !== ""
      )
    ) {
      return;
    }
    if (haveSameIds(assignedTimeIds, timeIds)) {
      return;
    }

    try {
      await orpc.planPeople.updateTimes({
        planPersonId: person.planPersonId,
        serviceTypeId,
        planId,
        personId: person.personId,
        planTimeIds: timeIds,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.teamPositions(serviceTypeId, planId, seriesId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.planTimes(serviceTypeId, planId),
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "people" && query.queryKey.includes(planId),
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "people-history-warmup" &&
            query.queryKey[1] === serviceTypeId,
        }),
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update times"
      );
    }
  };

  const { open, draft, setDraft, handleOpenChange } = useDraftPopover({
    value: assignedTimeIds,
    equals: haveSameIds,
    onPersist: persist,
  });
  const displayTimeIds = open ? draft : assignedTimeIds;
  const displayTimeIdSet = new Set(displayTimeIds);
  const draftTimeIdSet = new Set(draft);
  const selectedTimeCount = editablePlanTimeIds.filter((id) =>
    displayTimeIdSet.has(id)
  ).length;
  const isPartialAssignment = selectedTimeCount < planTimes.length;

  if (planTimes.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        display === "lineup" &&
          !isPartialAssignment &&
          "opacity-0 group-hover/person:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
      )}
    >
      <ResponsivePopover open={open} onOpenChange={handleOpenChange}>
        <ResponsivePopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="max-w-full"
              disabled={!canEdit}
              aria-label={`Edit times for ${person.name}`}
            />
          }
        >
          <Clock3 data-icon="inline-start" />
          {selectedTimeCount}/{planTimes.length}
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          title="Rehearsal times"
          align="end"
          sideOffset={8}
          className="w-96"
        >
          <Command>
            <CommandList>
              <CommandGroup>
                {planTimes.map((planTime) => {
                  const selected = draftTimeIdSet.has(planTime.id);

                  return (
                    <CommandItem
                      key={planTime.id}
                      value={`${planTime.name} ${planTime.id}`}
                      onSelect={() => {
                        setDraft((current) => toggleId(current, planTime.id));
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <Check
                        className={cn(selected ? "opacity-100" : "opacity-0")}
                      />
                      <span className="min-w-0 flex-1">
                        <MiddleTruncate text={planTime.name} />
                      </span>
                      <Badge variant="outline" className="max-w-[14rem]">
                        {formatPlanTimeScheduleLabel(planTime, timeZone)}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </ResponsivePopoverContent>
      </ResponsivePopover>
    </div>
  );
};
