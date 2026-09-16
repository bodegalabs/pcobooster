"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  cancelScheduleMutationQueries,
  optimisticallyUnschedulePlanPerson,
  restoreScheduleCaches,
  settleScheduleMutationQueries,
  type ScheduleMutationInvalidateContext,
} from "@/hooks/use-schedule-cache-optimism";
import { deleteJson, HttpClientError } from "@/lib/http/client";

function formatUnscheduleError(error: unknown): string {
  if (error instanceof HttpClientError)
    return error.message || "Failed to unschedule";
  if (error instanceof Error) return error.message;
  return "Failed to unschedule";
}

export function useUnschedulePlanPerson({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
} = {}) {
  const queryClient = useQueryClient();

  const unscheduleMutation = useMutation({
    mutationFn: ({
      planPersonId,
      context,
    }: {
      planPersonId: string;
      context?: ScheduleMutationInvalidateContext & {
        personId?: string | null;
      };
    }) =>
      deleteJson<{ success: boolean }>(
        `/api/schedule/${encodeURIComponent(planPersonId)}`,
        {
          serviceTypeId: context?.serviceTypeId ?? undefined,
          personId: context?.personId ?? undefined,
          planId: context?.planId ?? undefined,
        }
      ),
    onMutate: async ({ planPersonId, context }) => {
      await cancelScheduleMutationQueries(queryClient, context ?? {});
      return {
        snapshot: optimisticallyUnschedulePlanPerson(
          queryClient,
          planPersonId,
          context?.personId
        ),
      };
    },
    onSuccess: (_result, variables) => {
      settleScheduleMutationQueries(queryClient, variables.context ?? {});
      onSuccess?.();
    },
    onError: (error, _variables, context) => {
      restoreScheduleCaches(queryClient, context?.snapshot);
      onError?.(formatUnscheduleError(error));
    },
  });

  const handleUnschedule = (
    planPersonId: string | null | undefined,
    context?: ScheduleMutationInvalidateContext & { personId?: string | null }
  ) => {
    if (!planPersonId || unscheduleMutation.isPending) return;
    unscheduleMutation.mutate({ planPersonId, context });
  };

  return { isUnscheduling: unscheduleMutation.isPending, handleUnschedule };
}
