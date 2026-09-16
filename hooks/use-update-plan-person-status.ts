"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  cancelScheduleMutationQueries,
  optimisticallyUpdatePlanPersonStatus,
  restoreScheduleCaches,
  settleScheduleMutationQueries,
  type ScheduleMutationInvalidateContext,
} from "@/hooks/use-schedule-cache-optimism";
import { HttpClientError, patchJson } from "@/lib/http/client";

export type PlanPersonStatusCode = "C" | "U" | "D";

function formatUpdateStatusError(error: unknown): string {
  if (error instanceof HttpClientError) {
    return error.message || "Failed to update status";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to update status";
}

export function useUpdatePlanPersonStatus({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();
  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({
      planPersonId,
      status,
      context,
    }: {
      planPersonId: string;
      status: PlanPersonStatusCode;
      context?: ScheduleMutationInvalidateContext;
    }) =>
      patchJson<{ success: boolean }>(
        `/api/schedule/${encodeURIComponent(planPersonId)}/status`,
        {
          status,
          serviceTypeId: context?.serviceTypeId ?? undefined,
          personId: context?.personId ?? undefined,
          planId: context?.planId ?? undefined,
        }
      ),
    onMutate: async ({ planPersonId, status, context }) => {
      await cancelScheduleMutationQueries(queryClient, context ?? {});
      return {
        snapshot: optimisticallyUpdatePlanPersonStatus(
          queryClient,
          planPersonId,
          status
        ),
      };
    },
    onSuccess: (_result, variables) => {
      settleScheduleMutationQueries(queryClient, variables.context ?? {});
      onSuccess?.();
    },
    onError: (err, _variables, context) => {
      restoreScheduleCaches(queryClient, context?.snapshot);
      const message = formatUpdateStatusError(err);
      setUpdateError(message);
      onError?.(message);
    },
  });

  const handleUpdate = (
    planPersonId: string | null | undefined,
    status: PlanPersonStatusCode,
    context?: ScheduleMutationInvalidateContext
  ) => {
    if (!planPersonId || updateMutation.isPending) return;

    setUpdateError(null);
    updateMutation.mutate({ planPersonId, status, context });
  };

  return { isUpdating: updateMutation.isPending, updateError, handleUpdate };
}
