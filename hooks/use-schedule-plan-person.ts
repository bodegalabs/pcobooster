"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  cancelScheduleMutationQueries,
  optimisticallySchedulePerson,
  reconcileOptimisticPlanPersonId,
  restoreScheduleCaches,
  settleScheduleMutationQueries,
  type OptimisticSchedulePerson,
} from "@/hooks/use-schedule-cache-optimism";
import { HttpClientError, postJson } from "@/lib/http/client";

function formatSchedulePayloadError(json: unknown): string {
  if (!json || typeof json !== "object") return "Failed to schedule";
  const payload = json as {
    error?: unknown;
    details?: unknown;
    code?: unknown;
  };

  if (
    payload.code === "POSITION_MISMATCH" &&
    payload.details &&
    typeof payload.details === "object"
  ) {
    const details = payload.details as {
      selected?: { teamName?: string; positionName?: string };
      created?: { teamPositionName?: string };
    };
    const selectedTeam = details.selected?.teamName || "Unknown team";
    const selectedPosition =
      details.selected?.positionName || "Unknown position";
    const created = details.created?.teamPositionName || "Unknown position";
    return `Created in "${created}" instead of "${selectedTeam} - ${selectedPosition}".`;
  }

  if (typeof payload.details === "string" && payload.details.length > 0)
    return payload.details;
  if (typeof payload.error === "string" && payload.error.length > 0)
    return payload.error;
  return "Failed to schedule";
}

function formatScheduleClientError(error: HttpClientError): string {
  if (error.code === "ALREADY_SCHEDULED") return "ALREADY_SCHEDULED";
  if (error.code === "POSITION_MISMATCH" || error.details) {
    return formatSchedulePayloadError({
      error: error.message,
      code: error.code,
      details: error.details,
    });
  }
  return error.message || "Failed to schedule";
}

export function useSchedulePlanPerson({
  serviceTypeId,
  planId,
  teamId,
  positionId,
  teamName,
  positionName,
  canSchedule,
  onOptimisticSchedule,
  onScheduleSuccess,
  onScheduleError,
  oneOff = false,
}: {
  serviceTypeId: string | null | undefined;
  planId: string | null | undefined;
  teamId: string | null | undefined;
  positionId: string | null | undefined;
  teamName?: string | null | undefined;
  positionName?: string | null | undefined;
  canSchedule: boolean;
  onOptimisticSchedule?: () => void;
  onScheduleSuccess?: () => void;
  onScheduleError?: (message: string) => void;
  oneOff?: boolean;
}) {
  const queryClient = useQueryClient();
  const [scheduleSuccess, setScheduleSuccess] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    setScheduleSuccess(false);
    setScheduleError(null);
  }, [serviceTypeId, planId, teamId, positionId]);

  const scheduleMutation = useMutation({
    mutationFn: async ({ person }: { person: OptimisticSchedulePerson }) =>
      postJson<{ success: boolean; data?: { id?: string } }>("/api/schedule", {
        serviceTypeId,
        personId: person.id,
        planId,
        teamId,
        positionId,
        teamName: teamName || undefined,
        positionName: positionName || undefined,
        oneOff,
      }),
    onMutate: async ({ person }) => {
      if (!serviceTypeId || !planId || !teamId || !positionId) return {};

      const optimisticPlanPersonId = `optimistic:${planId}:${teamId}:${positionId}:${person.id}`;
      await cancelScheduleMutationQueries(queryClient, {
        serviceTypeId,
        planId,
        teamId,
        positionId,
      });

      setScheduleSuccess(true);
      const snapshot = optimisticallySchedulePerson(
        queryClient,
        { serviceTypeId, planId, teamId, positionId },
        person,
        optimisticPlanPersonId
      );
      onOptimisticSchedule?.();

      return { optimisticPlanPersonId, snapshot };
    },
    onSuccess: (result, _variables, context) => {
      const planPersonId = result.data?.id;
      if (planPersonId && context.optimisticPlanPersonId) {
        reconcileOptimisticPlanPersonId(
          queryClient,
          context.optimisticPlanPersonId,
          planPersonId
        );
      }
      settleScheduleMutationQueries(queryClient, {
        serviceTypeId,
        planId,
        teamId,
        positionId,
      });
      onScheduleSuccess?.();
    },
    onError: (err, _variables, context) => {
      if (err instanceof HttpClientError && err.code === "ALREADY_SCHEDULED") {
        setScheduleSuccess(true);
        settleScheduleMutationQueries(queryClient, {
          serviceTypeId,
          planId,
          teamId,
          positionId,
        });
        onScheduleSuccess?.();
        return;
      }

      restoreScheduleCaches(queryClient, context?.snapshot);
      setScheduleSuccess(false);
      const message =
        err instanceof HttpClientError
          ? formatScheduleClientError(err)
          : err instanceof Error
            ? err.message
            : "Failed to schedule";
      setScheduleError(message);
      onScheduleError?.(message);
    },
  });

  const handleSchedule = (input: string | OptimisticSchedulePerson) => {
    if (
      !serviceTypeId ||
      !planId ||
      !teamId ||
      !positionId ||
      scheduleMutation.isPending ||
      !canSchedule
    )
      return;

    setScheduleError(null);
    const person =
      typeof input === "string"
        ? { id: input, fullName: "Unknown person", photoThumbnailUrl: null }
        : {
            id: input.id,
            firstName: "firstName" in input ? input.firstName : undefined,
            lastName: "lastName" in input ? input.lastName : undefined,
            fullName: input.fullName,
            photoUrl: "photoUrl" in input ? input.photoUrl : undefined,
            photoThumbnailUrl: input.photoThumbnailUrl,
          };

    scheduleMutation.mutate({ person });
  };

  return {
    isScheduling: scheduleMutation.isPending,
    scheduleSuccess,
    scheduleError,
    handleSchedule,
  };
}
