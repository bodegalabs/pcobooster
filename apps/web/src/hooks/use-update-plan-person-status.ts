"use client";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import {
  cancelScheduleMutationQueries,
  optimisticallyUpdatePlanPersonStatus,
  restoreScheduleCaches,
  settleScheduleMutationQueries,
} from "@/hooks/use-schedule-cache-optimism";
import type { ScheduleMutationInvalidateContext } from "@/hooks/use-schedule-cache-optimism";
import { isNonEmptyString } from "@/lib/json";
import { orpc } from "@/orpc-client";

export type PlanPersonStatusCode = "C" | "U" | "D";

const messageErrorDataSchema = z.object({ message: z.string().optional() });

const formatUpdateStatusError = (error: Error): string => {
  if (error instanceof ORPCError) {
    const parsed = messageErrorDataSchema.safeParse(error.data);
    const message = parsed.success ? parsed.data.message : undefined;
    if (isNonEmptyString(message)) {
      return message;
    }
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
      await orpc.schedule.updateStatus({
        planPersonId,
        status,
        serviceTypeId: context?.serviceTypeId ?? undefined,
        personId: context?.personId ?? undefined,
        planId: context?.planId ?? undefined,
      }),
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

  return {
    isUpdating: updateMutation.isPending,
    updateError,
    handleUpdate,
    updateStatusAsync: async (
      planPersonId: string | null | undefined,
      status: PlanPersonStatusCode,
      context?: ScheduleMutationInvalidateContext
    ) => {
      if (!isNonEmptyString(planPersonId)) {
        throw new Error("Missing plan person");
      }
      if (updateMutation.isPending) {
        throw new Error("Status update already in progress");
      }

      setUpdateError(null);
      await updateMutation.mutateAsync({ planPersonId, status, context });
    },
  };
};
