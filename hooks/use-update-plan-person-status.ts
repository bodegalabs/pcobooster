"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  cancelScheduleMutationQueries,
  optimisticallyUpdatePlanPersonStatus,
  restoreScheduleCaches,
  settleScheduleMutationQueries,
} from "@/hooks/use-schedule-cache-optimism";
import type { ScheduleMutationInvalidateContext } from "@/hooks/use-schedule-cache-optimism";
import { successResponseSchema } from "@/lib/api-schemas";
import { HttpClientError, patchJson } from "@/lib/http/client";
import { isNonEmptyString } from "@/lib/json";

export type PlanPersonStatusCode = "C" | "U" | "D";

const formatUpdateStatusError = (error: Error): string => {
  if (error instanceof HttpClientError) {
    return error.message || "Failed to update status";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to update status";
};

export const useUpdatePlanPersonStatus = ({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
} = {}) => {
  const queryClient = useQueryClient();
  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async ({
      planPersonId,
      status,
      context,
    }: {
      planPersonId: string;
      status: PlanPersonStatusCode;
      context?: ScheduleMutationInvalidateContext;
    }) =>
      await patchJson(
        `/api/schedule/${encodeURIComponent(planPersonId)}/status`,
        successResponseSchema,
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
    if (!isNonEmptyString(planPersonId) || updateMutation.isPending) {
      return;
    }

    setUpdateError(null);
    updateMutation.mutate({ planPersonId, status, context });
  };

  return { isUpdating: updateMutation.isPending, updateError, handleUpdate };
};
