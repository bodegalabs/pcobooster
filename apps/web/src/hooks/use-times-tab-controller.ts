"use client";

import type { PlanTime } from "@pcobooster/planning-center-models/types";
import { useQueryClient } from "@tanstack/react-query";
import { startTransition, useMemo, useState } from "react";
import { toast } from "sonner";

import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import { usePlanTimes } from "@/hooks/use-plan-times";
import { useTeamPositions } from "@/hooks/use-team-positions";
import { queryKeys } from "@/lib/query-keys";
import {
  buildCreatePlanTimeRequest,
  buildDefaultNewPlanTimeEdit,
  buildEditablePlanTime,
  buildPlanTimePatch,
  getInvalidPlanTimeEditMessage,
  isValidPlanTimeEdit,
  planTimeEditHasChanges,
} from "@/lib/schedule/plan-time-edits";
import type { EditablePlanTime } from "@/lib/schedule/plan-time-edits";
import { orpc } from "@/orpc-client";

interface UseTimesTabControllerProps {
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
}

const emptyPlanTimes: PlanTime[] = [];

export const useTimesTabController = ({
  serviceTypeId,
  planId,
  seriesId,
}: UseTimesTabControllerProps) => {
  const queryClient = useQueryClient();
  const timeZone = useOrganizationTimeZone();
  const planTimesQuery = usePlanTimes(serviceTypeId, planId);
  const teamPositionsQuery = useTeamPositions(serviceTypeId, planId, seriesId);
  const planTimes = planTimesQuery.data ?? emptyPlanTimes;
  const [edits, setEdits] = useState<Record<string, EditablePlanTime>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addTimeOpen, setAddTimeOpen] = useState(false);

  const canManageTimes =
    serviceTypeId !== null &&
    serviceTypeId !== "" &&
    planId !== null &&
    planId !== "";

  const planTimesQueryKey = queryKeys.planTimes(serviceTypeId, planId);

  const invalidateRelatedPlanTimeQueries = async () => {
    if (!canManageTimes) {
      return;
    }
    await Promise.all([
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

  const refetchPlanTimes = async () => {
    await queryClient.refetchQueries({
      queryKey: planTimesQueryKey,
      type: "active",
    });
  };

  const invalidatePlanTimeQueries = async () => {
    if (!canManageTimes) {
      return;
    }
    await invalidateRelatedPlanTimeQueries();
    await refetchPlanTimes();
  };

  const persistPlanTime = async (
    planTime: PlanTime,
    edit: EditablePlanTime
  ) => {
    if (!canManageTimes) {
      return;
    }
    if (
      !planTimeEditHasChanges(
        planTime,
        edit,
        timeZone,
        teamPositionsQuery.data
      ) ||
      !isValidPlanTimeEdit(edit)
    ) {
      return;
    }

    setSavingId(planTime.id);
    try {
      const patch = buildPlanTimePatch(
        planTime,
        edit,
        timeZone,
        teamPositionsQuery.data
      );
      await orpc.planTimes.update({
        planTimeId: planTime.id,
        serviceTypeId,
        planId,
        name: patch.name,
        timeType: patch.time_type,
        startsAt: patch.starts_at,
        endsAt: patch.ends_at,
        assignedTeamIds: patch.assigned_team_ids,
        assignedPositionIds: patch.assigned_position_ids,
        assignedNeededPositionIds: patch.assigned_needed_position_ids,
        clearedNeededPositionIds: patch.cleared_needed_position_ids,
        assignedPlanPersonIds: patch.assigned_plan_person_ids,
        clearedPlanPersonIds: patch.cleared_plan_person_ids,
      });
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

  const createPlanTimeFromEdit = async (
    edit: EditablePlanTime
  ): Promise<boolean> => {
    if (!canManageTimes || creating || !isValidPlanTimeEdit(edit)) {
      return false;
    }

    setCreating(true);
    try {
      await queryClient.cancelQueries({ queryKey: planTimesQueryKey });
      const request = buildCreatePlanTimeRequest(edit, timeZone);
      const created = await orpc.planTimes.create({
        serviceTypeId,
        planId,
        name: request.name,
        timeType: request.time_type,
        startsAt: request.starts_at,
        endsAt: request.ends_at,
        assignedTeamIds: request.assigned_team_ids,
        assignedPositionIds: request.assigned_position_ids,
      });
      queryClient.setQueryData<PlanTime[]>(
        planTimesQueryKey,
        (current = emptyPlanTimes) => {
          if (current.some((time) => time.id === created.id)) {
            return current;
          }
          return [...current, created];
        }
      );
      await invalidateRelatedPlanTimeQueries();
      setAddTimeOpen(false);
      setCreating(false);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to add time"
      );
      setCreating(false);
      return false;
    }
  };

  const removePlanTime = async (planTime: PlanTime) => {
    if (!canManageTimes) {
      return;
    }
    setDeletingId(planTime.id);
    const snapshot = queryClient.getQueryData<PlanTime[]>(planTimesQueryKey);
    try {
      await queryClient.cancelQueries({ queryKey: planTimesQueryKey });
      queryClient.setQueryData<PlanTime[]>(
        planTimesQueryKey,
        (current = emptyPlanTimes) =>
          current.filter((time) => time.id !== planTime.id)
      );

      await orpc.planTimes.delete({
        planTimeId: planTime.id,
        serviceTypeId,
        planId,
      });
      setEdits((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== planTime.id)
        )
      );
      await invalidateRelatedPlanTimeQueries();
    } catch (error) {
      if (snapshot !== undefined) {
        queryClient.setQueryData(planTimesQueryKey, snapshot);
      }
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
    if (
      !planTimeEditHasChanges(planTime, edit, timeZone, teamPositionsQuery.data)
    ) {
      return;
    }
    if (!isValidPlanTimeEdit(edit)) {
      toast.error(getInvalidPlanTimeEditMessage(edit));
      return;
    }
    startTransition(async () => {
      await persistPlanTime(planTime, edit);
    });
  };

  const openAddTime = () => {
    setAddTimeOpen(true);
  };

  const defaultNewPlanTimeEdit = useMemo(
    () => buildDefaultNewPlanTimeEdit(planTimes, timeZone),
    [planTimes, timeZone]
  );

  return {
    planTimes,
    edits,
    timeZone,
    teamPositionGroups: teamPositionsQuery.data,
    assignmentsLoading: teamPositionsQuery.isLoading,
    isLoading: planTimesQuery.isLoading,
    savingId,
    deletingId,
    creating,
    addTimeOpen,
    setAddTimeOpen,
    canManageTimes,
    defaultNewPlanTimeEdit,
    updateEdit,
    commitEdit,
    persistIfChanged,
    removePlanTime,
    createPlanTimeFromEdit,
    openAddTime,
  };
};
