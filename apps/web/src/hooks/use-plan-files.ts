import type { PlanFile } from "@pcobooster/contracts/plan-files";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { planFileKind } from "@/lib/plan-files";
import { queryKeys } from "@/lib/query-keys";
import { callForQuery } from "@/lib/request-priority";
import { orpc } from "@/orpc-client";

export const usePlanFiles = (
  serviceTypeId: string,
  planId: string,
  enabled: boolean
) =>
  useInfiniteQuery({
    queryKey: queryKeys.planFiles(serviceTypeId, planId),
    initialPageParam: 0,
    queryFn: async (context) =>
      await callForQuery(
        context,
        async (options) =>
          await orpc.planFiles.list(
            { serviceTypeId, planId, offset: context.pageParam },
            options
          )
      ),
    getNextPageParam: (last) => last.nextOffset,
    enabled,
    staleTime: 60_000,
  });
export const usePlanFileLink = (
  serviceTypeId: string,
  planId: string,
  file: PlanFile,
  pdf: boolean
) =>
  useQuery({
    queryKey: queryKeys.planFileLink(serviceTypeId, planId, file.id, pdf),
    queryFn: async (context) =>
      await callForQuery(
        context,
        async (options) =>
          await orpc.planFiles.open(
            {
              serviceTypeId,
              planId,
              attachmentId: file.id,
              preview: file.hasPreview && planFileKind(file) === "document",
              pdf,
            },
            options
          )
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
