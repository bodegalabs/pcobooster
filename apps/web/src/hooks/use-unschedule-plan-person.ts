"use client";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import { z } from "zod";

import {
  cancelScheduleMutationQueries,
  optimisticallyUnschedulePlanPerson,
  restoreScheduleCaches,
  settleScheduleMutationQueries,
} from "@/hooks/use-schedule-cache-optimism";
import type { ScheduleMutationInvalidateContext } from "@/hooks/use-schedule-cache-optimism";
import { orpc } from "@/orpc-client";

const messageErrorDataSchema = z.object({ message: z.string().optional() });

const formatUnscheduleError = (error: Error): string => {
  if (error instanceof ORPCError) {
    const parsed = messageErrorDataSchema.safeParse(error.data);
    const message = parsed.success ? parsed.data.message : undefined;
    if (isNonEmptyString(message)) {
      return message;
    }
    return error.message || "Failed to unschedule";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Failed to unschedule";
};

export const useUnschedulePlanPerson = ({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void;
  onError?: (message: string) => void;
} = {}) => {
  const queryClient = useQueryClient();

  const unscheduleMutation = useMutation({
    mutationFn: async ({
      planPersonId,
      context,
    }: {
      planPersonId: string;
      context?: ScheduleMutationInvalidateContext & {
        personId?: string | null;
      };
    }) =>
      await orpc.schedule.remove({
        planPersonId,
        serviceTypeId: context?.serviceTypeId ?? undefined,
        personId: context?.personId ?? undefined,
        planId: context?.planId ?? undefined,
      }),
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
    if (!isNonEmptyString(planPersonId) || unscheduleMutation.isPending) {
      return;
    }
    unscheduleMutation.mutate({ planPersonId, context });
  };

  return { isUnscheduling: unscheduleMutation.isPending, handleUnschedule };
};
