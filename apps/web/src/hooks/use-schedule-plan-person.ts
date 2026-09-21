"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import {
  cancelScheduleMutationQueries,
  optimisticallySchedulePerson,
  reconcileOptimisticPlanPersonId,
  restoreScheduleCaches,
  settleScheduleMutationQueries,
} from "@/hooks/use-schedule-cache-optimism";
import type { OptimisticSchedulePerson } from "@/hooks/use-schedule-cache-optimism";
import { scheduleResponseSchema } from "@/lib/api-schemas";
import { HttpClientError, postJson } from "@/lib/http/client";
import { isNonEmptyString, isString } from "@/lib/json";

const mismatchDetailsSchema = z.object({
  selected: z
    .object({
      teamName: z.string().optional(),
      positionName: z.string().optional(),
    })
    .optional(),
  created: z.object({ teamPositionName: z.string().optional() }).optional(),
});

const formatScheduleClientError = (error: HttpClientError): string => {
  if (error.code === "ALREADY_SCHEDULED") {
    return "ALREADY_SCHEDULED";
  }
  if (error.code === "POSITION_MISMATCH") {
    const parsed = mismatchDetailsSchema.safeParse(error.details);
    if (parsed.success) {
      const { selected, created } = parsed.data;
      return `Created in "${created?.teamPositionName ?? "Unknown position"}" instead of "${selected?.teamName ?? "Unknown team"} - ${selected?.positionName ?? "Unknown position"}".`;
    }
  }
  if (isString(error.details) && error.details.length > 0) {
    return error.details;
  }
  return error.message || "Failed to schedule";
};

interface ScheduleFeedback {
  scope: string;
  success: boolean;
  error: string | null;
}

export const useSchedulePlanPerson = ({
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
}) => {
  const queryClient = useQueryClient();
  const scope = JSON.stringify([serviceTypeId, planId, teamId, positionId]);
  const [feedback, setFeedback] = useState<ScheduleFeedback | null>(null);
  const scheduleSuccess = feedback?.scope === scope && feedback.success;
  const scheduleError = feedback?.scope === scope ? feedback.error : null;
  const setScheduleSuccess = (success: boolean) => {
    setFeedback((current) => ({
      scope,
      success,
      error: current?.scope === scope ? current.error : null,
    }));
  };
  const setScheduleError = (error: string | null) => {
    setFeedback((current) => ({
      scope,
      error,
      success: current?.scope === scope && current.success,
    }));
  };

  const scheduleMutation = useMutation({
    mutationFn: async ({ person }: { person: OptimisticSchedulePerson }) =>
      await postJson("/api/schedule", scheduleResponseSchema, {
        serviceTypeId,
        personId: person.id,
        planId,
        teamId,
        positionId,
        teamName: teamName ?? undefined,
        positionName: positionName ?? undefined,
        oneOff,
      }),
    onMutate: async ({ person }) => {
      if (
        !isNonEmptyString(serviceTypeId) ||
        !isNonEmptyString(planId) ||
        !isNonEmptyString(teamId) ||
        !isNonEmptyString(positionId)
      ) {
        return {};
      }

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
      if (
        isNonEmptyString(planPersonId) &&
        context.optimisticPlanPersonId !== undefined &&
        context.optimisticPlanPersonId !== ""
      ) {
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
          : err.message;
      setScheduleError(message);
      onScheduleError?.(message);
    },
  });

  const handleSchedule = (input: string | OptimisticSchedulePerson) => {
    if (
      !isNonEmptyString(serviceTypeId) ||
      !isNonEmptyString(planId) ||
      !isNonEmptyString(teamId) ||
      !isNonEmptyString(positionId) ||
      scheduleMutation.isPending ||
      !canSchedule
    ) {
      return;
    }

    setScheduleError(null);
    const person = isString(input)
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
};
