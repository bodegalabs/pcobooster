"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { startTransition, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PlanTimeCard } from "@/components/schedule/plan-time-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { usePlanTimes } from "@/hooks/use-plan-times";
import { useTeamPositions } from "@/hooks/use-team-positions";
import { serializedPlanTimeSchema } from "@/lib/api-schemas";
import { deleteJson, patchJson, postJson } from "@/lib/http/client";
import {
  formatWallTimeInTimeZone,
  zonedWallTimeToUtcIso,
} from "@/lib/planning-center/org-calendar";
import { queryKeys } from "@/lib/query-keys";
import type { PlanTime, PlanTimeType, TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TimesTabProps {
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
}

interface EditablePlanTime {
  name: string;
  timeType: PlanTimeType;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  assignedTeamIds: string[];
  assignedPositionIds: string[];
  assignedNeededPositionIds: string[];
  assignedPlanPersonIds: string[];
}

const emptyPlanTimes: PlanTime[] = [];

const haveSameIds = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const aSet = new Set(a);
  return b.every((id) => aSet.has(id));
};

const isValidEdit = (edit: EditablePlanTime): boolean => {
  if (!edit.name.trim()) {
    return false;
  }
  if (!edit.startDate || !edit.startTime) {
    return false;
  }
  if (!edit.endTime) {
    return true;
  }

  const start = Date.parse(`${edit.startDate}T${edit.startTime}:00`);
  const end = Date.parse(`${edit.endDate}T${edit.endTime}:00`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
};

const getInvalidEditMessage = (edit: EditablePlanTime): string => {
  if (!edit.name.trim()) {
    return "Time name is required.";
  }
  if (!edit.startDate || !edit.startTime) {
    return "Start date and time are required.";
  }
  if (edit.endTime) {
    const start = Date.parse(`${edit.startDate}T${edit.startTime}:00`);
    const end = Date.parse(`${edit.endDate}T${edit.endTime}:00`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return "End time must be after start time.";
    }
  }
  return "Fix this time before saving.";
};

const getNeededPositionIdsForTime = (
  groups: TeamPositionGroup[] | undefined,
  planTimeId: string
): string[] => {
  const neededPositionIds: string[] = [];
  for (const group of groups ?? []) {
    for (const position of group.positions) {
      if (
        position.timeId === planTimeId &&
        position.neededPositionId !== undefined &&
        position.neededPositionId !== ""
      ) {
        neededPositionIds.push(position.neededPositionId);
      }
    }
  }
  return neededPositionIds;
};

const getPlanPersonIdsForTime = (
  groups: TeamPositionGroup[] | undefined,
  planTimeId: string
): string[] => {
  const planPersonIds: string[] = [];
  for (const group of groups ?? []) {
    for (const position of group.positions) {
      for (const person of position.filledPeople ?? []) {
        if (person.assignedTimeIds?.includes(planTimeId) === true) {
          planPersonIds.push(person.planPersonId);
        }
      }
    }
  }
  return planPersonIds;
};

const buildEditablePlanTime = (
  planTime: PlanTime,
  timeZone: string,
  teamPositionGroups: TeamPositionGroup[] | undefined
): EditablePlanTime => {
  const starts = formatWallTimeInTimeZone(planTime.startsAt, timeZone);
  const ends = planTime.endsAt
    ? formatWallTimeInTimeZone(planTime.endsAt, timeZone)
    : null;

  return {
    name: planTime.name,
    timeType: planTime.timeType,
    startDate: starts.dateKey,
    startTime: starts.timeValue,
    endDate: ends?.dateKey ?? starts.dateKey,
    endTime: ends?.timeValue ?? "",
    assignedTeamIds: planTime.assignedTeamIds,
    assignedPositionIds: planTime.assignedPositionIds,
    assignedNeededPositionIds: getNeededPositionIdsForTime(
      teamPositionGroups,
      planTime.id
    ),
    assignedPlanPersonIds: getPlanPersonIdsForTime(
      teamPositionGroups,
      planTime.id
    ),
  };
};

const hasChanges = (
  planTime: PlanTime,
  edit: EditablePlanTime,
  timeZone: string,
  teamPositionGroups: TeamPositionGroup[] | undefined
): boolean => {
  const original = buildEditablePlanTime(
    planTime,
    timeZone,
    teamPositionGroups
  );
  return (
    original.name !== edit.name ||
    original.timeType !== edit.timeType ||
    original.startDate !== edit.startDate ||
    original.startTime !== edit.startTime ||
    original.endDate !== edit.endDate ||
    original.endTime !== edit.endTime ||
    !haveSameIds(original.assignedTeamIds, edit.assignedTeamIds) ||
    !haveSameIds(original.assignedPositionIds, edit.assignedPositionIds) ||
    !haveSameIds(
      original.assignedNeededPositionIds,
      edit.assignedNeededPositionIds
    ) ||
    !haveSameIds(original.assignedPlanPersonIds, edit.assignedPlanPersonIds)
  );
};

const buildPlanTimePatch = (
  planTime: PlanTime,
  edit: EditablePlanTime,
  timeZone: string,
  teamPositionGroups: TeamPositionGroup[] | undefined
) => {
  const originalNeededPositionIds = getNeededPositionIdsForTime(
    teamPositionGroups,
    planTime.id
  );
  const originalPlanPersonIds = getPlanPersonIdsForTime(
    teamPositionGroups,
    planTime.id
  );
  const originalNeededPositionIdSet = new Set(originalNeededPositionIds);
  const originalPlanPersonIdSet = new Set(originalPlanPersonIds);
  const editedNeededPositionIdSet = new Set(edit.assignedNeededPositionIds);
  const editedPlanPersonIdSet = new Set(edit.assignedPlanPersonIds);
  const newlyAssignedNeededPositionIds = edit.assignedNeededPositionIds.filter(
    (id) => !originalNeededPositionIdSet.has(id)
  );
  const newlyAssignedPlanPersonIds = edit.assignedPlanPersonIds.filter(
    (id) => !originalPlanPersonIdSet.has(id)
  );
  return {
    name: edit.name.trim(),
    time_type: edit.timeType,
    starts_at: zonedWallTimeToUtcIso(edit.startDate, edit.startTime, timeZone),
    ends_at: edit.endTime
      ? zonedWallTimeToUtcIso(
          edit.endDate || edit.startDate,
          edit.endTime,
          timeZone
        )
      : null,
    assigned_team_ids: edit.assignedTeamIds,
    assigned_position_ids: edit.assignedPositionIds,
    assigned_needed_position_ids: newlyAssignedNeededPositionIds,
    cleared_needed_position_ids: originalNeededPositionIds.filter(
      (id) => !editedNeededPositionIdSet.has(id)
    ),
    assigned_plan_person_ids: newlyAssignedPlanPersonIds,
    cleared_plan_person_ids: originalPlanPersonIds.filter(
      (id) => !editedPlanPersonIdSet.has(id)
    ),
  };
};

const TimesTabCards = ({
  planTimes,
  edits,
  timeZone,
  teamPositionGroups,
  assignmentsLoading,
  savingId,
  deletingId,
  onEditChange,
  onCommitEdit,
  onPersist,
  onDelete,
}: {
  planTimes: PlanTime[];
  edits: Record<string, EditablePlanTime>;
  timeZone: string;
  teamPositionGroups: TeamPositionGroup[] | undefined;
  assignmentsLoading: boolean;
  savingId: string | null;
  deletingId: string | null;
  onEditChange: (planTime: PlanTime, patch: Partial<EditablePlanTime>) => void;
  onCommitEdit: (planTime: PlanTime, patch: Partial<EditablePlanTime>) => void;
  onPersist: (planTime: PlanTime) => void;
  onDelete: (planTime: PlanTime) => Promise<void>;
}) => (
  <div className="flex flex-col gap-2.5 pb-6">
    {planTimes.map((planTime) => {
      const edit =
        edits[planTime.id] ??
        buildEditablePlanTime(planTime, timeZone, teamPositionGroups);
      return (
        <PlanTimeCard
          key={planTime.id}
          planTimeId={planTime.id}
          edit={edit}
          valid={isValidEdit(edit)}
          saving={savingId === planTime.id}
          deleting={deletingId === planTime.id}
          assignmentGroups={teamPositionGroups ?? []}
          assignmentsLoading={assignmentsLoading}
          onEditChange={(patch) => {
            onEditChange(planTime, patch);
          }}
          onCommitEdit={(patch) => {
            onCommitEdit(planTime, patch);
          }}
          onPersist={() => {
            onPersist(planTime);
          }}
          onDelete={async () => {
            await onDelete(planTime);
          }}
        />
      );
    })}
  </div>
);

const TimesTabContent = ({
  serviceTypeId,
  planId,
  seriesId,
}: TimesTabProps) => {
  const queryClient = useQueryClient();
  const timeZone = useOrganizationTimeZone();
  const planTimesQuery = usePlanTimes(serviceTypeId, planId);
  const teamPositionsQuery = useTeamPositions(serviceTypeId, planId, seriesId);
  const planTimes = planTimesQuery.data ?? emptyPlanTimes;
  const { isLoading, isPlaceholderData } = planTimesQuery;
  const [edits, setEdits] = useState<Record<string, EditablePlanTime>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidatePlanTimeQueries = async () => {
    if (
      !(serviceTypeId !== null && serviceTypeId !== "") ||
      !(planId !== null && planId !== "")
    ) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.planTimes(serviceTypeId, planId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.plans(serviceTypeId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.teamPositions(serviceTypeId, planId, seriesId),
      }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "people-history-warmup" &&
          query.queryKey[1] === serviceTypeId,
      }),
    ]);
  };

  const persistPlanTime = async (
    planTime: PlanTime,
    edit: EditablePlanTime
  ) => {
    if (
      !(serviceTypeId !== null && serviceTypeId !== "") ||
      !(planId !== null && planId !== "")
    ) {
      return;
    }
    if (
      !hasChanges(planTime, edit, timeZone, teamPositionsQuery.data) ||
      !isValidEdit(edit)
    ) {
      return;
    }

    setSavingId(planTime.id);
    try {
      await patchJson(
        `/api/plan-times/${planTime.id}`,
        serializedPlanTimeSchema,
        {
          service_type_id: serviceTypeId,
          plan_id: planId,
          ...buildPlanTimePatch(
            planTime,
            edit,
            timeZone,
            teamPositionsQuery.data
          ),
        }
      );
      await invalidatePlanTimeQueries();
      setEdits((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== planTime.id)
        )
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update time"
      );
    }
    setSavingId(null);
  };

  const createPlanTime = async () => {
    if (
      !(serviceTypeId !== null && serviceTypeId !== "") ||
      !(planId !== null && planId !== "") ||
      creating
    ) {
      return;
    }
    const template = planTimes.at(-1);
    const starts = template
      ? formatWallTimeInTimeZone(template.startsAt, timeZone)
      : formatWallTimeInTimeZone(new Date(), timeZone);
    const ends = template?.endsAt
      ? formatWallTimeInTimeZone(template.endsAt, timeZone)
      : null;

    setCreating(true);
    try {
      await postJson(
        `/api/plans/${encodeURIComponent(planId)}/times`,
        serializedPlanTimeSchema,
        {
          service_type_id: serviceTypeId,
          name:
            template?.timeType === "rehearsal"
              ? "New rehearsal"
              : "New service",
          time_type: template?.timeType ?? "service",
          starts_at: zonedWallTimeToUtcIso(
            starts.dateKey,
            starts.timeValue,
            timeZone
          ),
          ends_at: ends
            ? zonedWallTimeToUtcIso(ends.dateKey, ends.timeValue, timeZone)
            : null,
          assigned_team_ids: template?.assignedTeamIds ?? [],
          assigned_position_ids: template?.assignedPositionIds ?? [],
        }
      );
      await invalidatePlanTimeQueries();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add time"
      );
    }
    setCreating(false);
  };

  const removePlanTime = async (planTime: PlanTime) => {
    if (
      !(serviceTypeId !== null && serviceTypeId !== "") ||
      !(planId !== null && planId !== "")
    ) {
      return;
    }
    setDeletingId(planTime.id);
    try {
      await deleteJson(
        `/api/plan-times/${encodeURIComponent(planTime.id)}`,
        z.undefined(),
        {
          service_type_id: serviceTypeId,
          plan_id: planId,
        }
      );
      setEdits((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== planTime.id)
        )
      );
      await invalidatePlanTimeQueries();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete time"
      );
    }
    setDeletingId(null);
  };

  const updateEdit = (planTime: PlanTime, patch: Partial<EditablePlanTime>) => {
    setEdits((current) => ({
      ...current,
      [planTime.id]: {
        ...(current[planTime.id] ??
          buildEditablePlanTime(planTime, timeZone, teamPositionsQuery.data)),
        ...patch,
      },
    }));
  };

  const commitEdit = (planTime: PlanTime, patch: Partial<EditablePlanTime>) => {
    const nextEdit = {
      ...(edits[planTime.id] ??
        buildEditablePlanTime(planTime, timeZone, teamPositionsQuery.data)),
      ...patch,
    };
    setEdits((current) => ({
      ...current,
      [planTime.id]: nextEdit,
    }));
    startTransition(async () => {
      await persistPlanTime(planTime, nextEdit);
    });
  };

  const persistIfChanged = (planTime: PlanTime) => {
    const edit = edits[planTime.id];
    if (edit === undefined) {
      return;
    }
    if (!hasChanges(planTime, edit, timeZone, teamPositionsQuery.data)) {
      return;
    }
    if (!isValidEdit(edit)) {
      toast.error(getInvalidEditMessage(edit));
      return;
    }
    startTransition(async () => {
      await persistPlanTime(planTime, edit);
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (planTimes.length === 0) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm">
        <span>No times found for this plan.</span>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            startTransition(createPlanTime);
          }}
          disabled={
            creating ||
            !(serviceTypeId !== null && serviceTypeId !== "") ||
            !(planId !== null && planId !== "")
          }
        >
          <Plus className="size-4" />
          Add time
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-auto",
        isPlaceholderData && "opacity-70"
      )}
    >
      <div className="flex items-center justify-end pb-3">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            startTransition(createPlanTime);
          }}
          disabled={
            creating ||
            !(serviceTypeId !== null && serviceTypeId !== "") ||
            !(planId !== null && planId !== "")
          }
        >
          <Plus className="size-4" />
          Add time
        </Button>
      </div>
      <TimesTabCards
        planTimes={planTimes}
        edits={edits}
        timeZone={timeZone}
        teamPositionGroups={teamPositionsQuery.data}
        assignmentsLoading={teamPositionsQuery.isLoading}
        savingId={savingId}
        deletingId={deletingId}
        onEditChange={updateEdit}
        onCommitEdit={commitEdit}
        onPersist={persistIfChanged}
        onDelete={removePlanTime}
      />
    </div>
  );
};

export const TimesTab = (props: TimesTabProps) => (
  <TimesTabContent key={`${props.serviceTypeId}:${props.planId}`} {...props} />
);
