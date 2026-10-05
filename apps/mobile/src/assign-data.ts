import {
  assembleCandidateList,
  collectCandidateDetails,
  expandWindowHistory,
  advancedBlockoutChecks,
  needsScheduleHistory,
  planCandidateDetailsBatches,
  windowHistoryAdvanced,
} from "@pcobooster/client/position-candidates";
import { queryKeys } from "@pcobooster/client/query-keys";
import { callForQuery } from "@pcobooster/client/request-priority";
import type {
  CandidateDetailsBatch,
  PlanWindowHistoryBatch,
} from "@pcobooster/contracts/people-schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { selectedCustomSlot } from "./assign-slot";
import { readBatches, readProgressively } from "./progressive";
import { useRpcQuery, useScreenFocus, useSession } from "./runtime";

export interface AssignmentRoute {
  serviceTypeId: string;
  planId: string;
  teamId: string;
  positionId: string;
  positionName?: string;
  source?: string;
}
interface Slot {
  teamId: string;
  positionId: string;
}
type WindowCursor =
  | { plans: PlanWindowHistoryBatch["deferredPlans"]; serviceTypeIds: string[] }
  | undefined;

export const useAssignmentCandidates = (
  params: AssignmentRoute,
  slot: Slot
) => {
  const { rpc } = useSession();
  const client = useQueryClient();
  const plan = useRpcQuery(
    "catalog.plan",
    params,
    queryKeys.planDetails(params.serviceTypeId, params.planId)
  );
  const groups = useRpcQuery(
    "catalog.teamPositions",
    params,
    queryKeys.teamPositions(params.serviceTypeId, params.planId, null)
  );
  const candidates = useRpcQuery(
    "people.positionCandidates",
    { ...params, ...slot },
    queryKeys.positionCandidates(
      params.serviceTypeId,
      slot.teamId,
      slot.positionId,
      params.planId
    ),
    slot.positionId.length > 0 && !selectedCustomSlot(params, slot)
  );
  const date = plan.data?.sortDate?.toISOString();
  const historyKey = queryKeys.planWindowHistory(date ?? "");
  const focused = useScreenFocus(historyKey);
  const history = useQuery({
    queryKey: historyKey,
    enabled: focused && date !== undefined && slot.positionId.length > 0,
    queryFn: async (context) => {
      if (date === undefined) {
        throw new Error("Plan date is unavailable");
      }
      const calls: PlanWindowHistoryBatch[] = [];
      await readProgressively<WindowCursor, PlanWindowHistoryBatch>({
        initial: undefined,
        signal: context.signal,
        read: async (continuation) =>
          await callForQuery(
            context,
            async (options) =>
              await rpc.call(
                "people.planWindowHistory",
                { date, continuation },
                options
              )
          ),
        // History stays atomic: absence has meaning for frequency scoring.
        publish: (batch) => {
          calls.push(batch);
        },
        continuation: (continuation, batch) => {
          if (
            continuation !== undefined &&
            !windowHistoryAdvanced(continuation, batch)
          ) {
            throw new Error(
              "History loading stopped making progress. Please retry."
            );
          }
          return batch.deferredPlans.length > 0 ||
            batch.deferredServiceTypeIds.length > 0
            ? {
                plans: batch.deferredPlans,
                serviceTypeIds: batch.deferredServiceTypeIds,
              }
            : null;
        },
      });
      return calls;
    },
  });
  const batches = planCandidateDetailsBatches(candidates.data, 16);
  const scheduleHistory = needsScheduleHistory(history.data);
  const detailsKey = queryKeys.candidateDetails(
    date ?? "",
    scheduleHistory ? params.planId : null,
    candidates.data?.candidates.map(({ id }) => id) ?? []
  );
  const detailFocused = useScreenFocus(detailsKey);
  const details = useQuery({
    queryKey: detailsKey,
    enabled:
      detailFocused &&
      date !== undefined &&
      candidates.data !== undefined &&
      history.data !== undefined,
    queryFn: async (context) => {
      if (date === undefined) {
        throw new Error("Plan date is unavailable");
      }
      const settled: CandidateDetailsBatch["people"][] = [];
      const emptyBlockoutProgress: CandidateDetailsBatch["blockoutProgress"] =
        [];
      await readBatches({
        inputs: batches,
        signal: context.signal,
        read: async (ids) => {
          const people: CandidateDetailsBatch["people"] = [];
          settled.push(people);
          await readProgressively({
            initial: {
              personIds: ids,
              blockoutProgress: emptyBlockoutProgress,
            },
            signal: context.signal,
            read: async (cursor) =>
              await callForQuery(
                context,
                async (options) =>
                  await rpc.call(
                    "people.candidateDetails",
                    { date, planId: params.planId, scheduleHistory, ...cursor },
                    options
                  )
              ),
            publish: (batch) => {
              people.push(...batch.people);
              client.setQueryData(
                detailsKey,
                settled.map((entries) => [...entries])
              );
            },
            continuation: (cursor, batch) => {
              if (
                batch.people.length === 0 &&
                batch.deferredPersonIds.length >= cursor.personIds.length &&
                !advancedBlockoutChecks(
                  cursor.blockoutProgress,
                  batch.blockoutProgress
                )
              ) {
                throw new Error(
                  "Availability loading stopped making progress. Please retry."
                );
              }
              return batch.deferredPersonIds.length === 0
                ? null
                : {
                    personIds: batch.deferredPersonIds,
                    blockoutProgress: batch.blockoutProgress,
                  };
            },
          });
        },
      });
      return settled;
    },
  });
  const position = groups.data
    ?.flatMap((group) => group.positions)
    .find(({ id }) => id === slot.positionId);
  const list =
    candidates.data !== undefined && date !== undefined
      ? assembleCandidateList({
          candidates: candidates.data,
          windowHistory: expandWindowHistory(history.data, params.planId),
          scheduleHistory,
          details: collectCandidateDetails(details.data ?? []),
          date,
          slotTimePreferenceOptionId: position?.timePreferenceOptionId ?? null,
        })
      : null;
  return { groups, candidates, history, details, position, list, plan };
};
