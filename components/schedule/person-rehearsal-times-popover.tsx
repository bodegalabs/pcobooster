"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Clock3 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { formatPlanTimeRangeLabel } from "@/components/schedule/plan-time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { useDraftPopover } from "@/hooks/use-persist-on-close-popover";
import { patchJson } from "@/lib/http/client";
import { formatWallTimeInTimeZone } from "@/lib/planning-center/org-calendar";
import { queryKeys } from "@/lib/query-keys";
import type { FilledPositionPerson, PlanTime } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PersonRehearsalTimesPopoverProps {
  person: FilledPositionPerson;
  planTimes: PlanTime[];
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
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
      await patchJson(
        `/api/plan-people/${encodeURIComponent(person.planPersonId)}/times`,
        z.object({ ok: z.literal(true) }),
        {
          service_type_id: serviceTypeId,
          plan_id: planId,
          person_id: person.personId,
          plan_time_ids: timeIds,
        }
      );
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

  if (planTimes.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost-muted"
          size="tiny"
          className="max-w-full"
          disabled={!canEdit}
          aria-label={`Edit times for ${person.name}`}
        >
          <Clock3 data-icon="inline-start" />
          {selectedTimeCount}/{planTimes.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        density="flush"
        className="w-96"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
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
                    <span className="min-w-0 flex-1 truncate">
                      {planTime.name}
                    </span>
                    <Badge
                      variant="outline"
                      weight="normal"
                      clipped
                      className="max-w-[14rem]"
                    >
                      {formatPlanTimeScheduleLabel(planTime, timeZone)}
                    </Badge>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
