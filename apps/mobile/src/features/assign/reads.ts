import type { ProductApi } from "@pcobooster/client/product-client";
import { callForQuery, speculativeQuery } from "@pcobooster/client/query";
import {
  CANDIDATE_DETAILS_BATCH_CONCURRENCY,
  candidateDetailsAdvanced,
  readPlanWindowHistory,
} from "@pcobooster/planning-center-models/candidate-list";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";
import type { Effect } from "effect";

import type { AppClient } from "../../app-shell/app-client";
import type { ProductClientContextValue } from "../../app-shell/queries";
import { planReads } from "../plan/reads";
import type { PlanReadContext } from "../plan/reads";

export interface CandidateSlot {
  serviceTypeId: string;
  planId: string;
  teamId: string;
  positionId: string;
  date: string;
  timePreferenceOptionId?: string | null;
}
export type CandidateDetail = Effect.Success<
  ReturnType<ProductApi["people"]["candidateDetails"]>
>["people"][number];
type DetailRequest = Parameters<ProductApi["people"]["candidateDetails"]>[0];
type DetailInput = DetailRequest["params"] & DetailRequest["payload"];
const STALE_MS = 300_000;

/**
 * The window around a plan date, one service type per call, all at once (see
 * `readPlanWindowHistory`). A saved service type list is used as is, even when stale, so the
 * history never waits on it.
 */
export const fetchWindowHistory = async (
  read: PlanReadContext,
  date: string,
  context: QueryFunctionContext
): Promise<
  Effect.Success<ReturnType<ProductApi["people"]["planWindowHistory"]>>[]
> => {
  const serviceTypesQuery = planReads.serviceTypes(read);
  const serviceTypes =
    context.client.getQueryData(serviceTypesQuery.queryKey) ??
    (await context.client.query(serviceTypesQuery));
  return await readPlanWindowHistory(
    serviceTypes.map(({ id }) => id),
    async (serviceTypeId, continuation) => {
      const input = { date, serviceTypeId, continuation };
      return await callForQuery(context, read.client, (api) =>
        api.people.planWindowHistory({ payload: input })
      );
    }
  );
};

export const fetchCandidateDetails = async (
  read: PlanReadContext,
  input: DetailInput,
  context: QueryFunctionContext
): Promise<CandidateDetail[]> => {
  const targetClientNative2 = read.client;
  const capturedInputNative2 = input;
  const batch = await callForQuery(context, targetClientNative2, (api) =>
    api.people.candidateDetails({
      params: capturedInputNative2,
      payload: capturedInputNative2,
    })
  );
  if (batch.deferredPersonIds.length === 0) {
    return batch.people;
  }
  if (!candidateDetailsAdvanced(input.continuation, batch)) {
    throw new Error("Candidate details made no progress.");
  }
  return [
    ...batch.people,
    ...(await fetchCandidateDetails(
      read,
      {
        ...input,
        personIds: batch.deferredPersonIds,
        continuation: batch.continuation,
      },
      context
    )),
  ];
};

/**
 * Detail batches run at most two at a time per account, however they start: first load, pull
 * to refresh, or the refetch a schedule write settles (Swift's `BatchedLoad` and the request
 * budget in AGENTS.md). A waiting batch whose query is cancelled gives up its turn.
 */
const detailTurns = new WeakMap<
  AppClient,
  { active: number; waiting: (() => void)[] }
>();
const inTurn = async <Result>(
  client: AppClient,
  signal: AbortSignal,
  run: () => Promise<Result>
): Promise<Result> => {
  let turns = detailTurns.get(client);
  if (turns === undefined) {
    turns = { active: 0, waiting: [] };
    detailTurns.set(client, turns);
  }
  const queue = turns;
  if (queue.active < CANDIDATE_DETAILS_BATCH_CONCURRENCY) {
    queue.active += 1;
  } else {
    // A finishing batch hands its turn straight to the next one waiting.
    const turn = Promise.withResolvers<null>();
    queue.waiting.push(() => {
      turn.resolve(null);
    });
    await turn.promise;
  }
  try {
    // Hermes's AbortSignal has no `throwIfAborted`.
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error("The candidate details read was cancelled.");
    }
    return await run();
  } finally {
    const waiter = queue.waiting.shift();
    if (waiter === undefined) {
      queue.active -= 1;
    } else {
      waiter();
    }
  }
};

export const assignReads = {
  candidates: ({ client, scope }: PlanReadContext, slot: CandidateSlot) =>
    queryOptions({
      queryKey: [
        scope,
        "people.positionCandidates",
        slot.serviceTypeId,
        slot.teamId,
        slot.positionId,
        slot.planId,
      ],
      queryFn: async (context) => {
        const targetClientNative3 = client;
        const inputNative3 = {
          serviceTypeId: slot.serviceTypeId,
          planId: slot.planId,
          teamId: slot.teamId,
          positionId: slot.positionId,
        };
        return await callForQuery(context, targetClientNative3, (api) =>
          api.people.positionCandidates({
            params: inputNative3,
            query: inputNative3,
          })
        );
      },
      staleTime: STALE_MS,
    }),
  history: (context: PlanReadContext, date: string) =>
    queryOptions({
      queryKey: [context.scope, "people.planWindowHistory", date],
      queryFn: async (query) => await fetchWindowHistory(context, date, query),
      staleTime: STALE_MS,
    }),
  details: (
    context: PlanReadContext,
    slot: CandidateSlot,
    personIds: string[],
    scheduleHistory: boolean
  ) =>
    queryOptions({
      queryKey: [
        context.scope,
        "people.candidateDetails",
        slot.planId,
        slot.date,
        personIds,
        scheduleHistory,
      ],
      queryFn: async (query) =>
        await inTurn(
          context.client,
          query.signal,
          async () =>
            await fetchCandidateDetails(
              context,
              {
                personIds,
                planId: slot.planId,
                date: slot.date,
                scheduleHistory,
              },
              query
            )
        ),
      staleTime: STALE_MS,
    }),
  search: ({ client, scope }: PlanReadContext, query: string) =>
    queryOptions({
      queryKey: [scope, "people.search", query],
      queryFn: async (context) => {
        const targetClientNative4 = client;
        const inputNative4 = { query };
        return await callForQuery(context, targetClientNative4, (api) =>
          api.people.search({ query: inputNative4 })
        );
      },
      staleTime: STALE_MS,
    }),
};

/** A deliberate position selection warms only its small candidate read. */
export const warmCandidates = async (
  context: ProductClientContextValue,
  cache: QueryClient,
  slot: CandidateSlot,
  signal?: AbortSignal
): Promise<void> => {
  await context.scheduler.runSpeculative(async () => {
    await cache.query(speculativeQuery(assignReads.candidates(context, slot)));
  }, signal);
};

/**
 * What the list shows while candidate reads load (Swift `AssignCandidatePipeline`): the
 * skeleton until the candidates arrive and briefly after (so the list reorders once), a failed
 * candidate list on its own, failed history or availability as a count to retry, and progress
 * only while the rest loads without failures.
 */
export const candidateReadState = ({
  open,
  candidatesLoaded,
  candidatesError,
  failedParts,
  complete,
  released,
}: {
  /** A roster position is selected, so candidates are read. */
  open: boolean;
  candidatesLoaded: boolean;
  candidatesError: Error | null;
  /** History and detail reads that failed. */
  failedParts: number;
  complete: boolean;
  /** The short wait for scores before the list shows in name order has passed. */
  released: boolean;
}) => {
  const waiting =
    open && candidatesError === null && failedParts === 0 && !complete;
  return {
    loading:
      open &&
      candidatesError === null &&
      (!candidatesLoaded || (waiting && !released)),
    candidatesError,
    failedParts,
    showsProgress: candidatesLoaded && waiting && released,
  };
};
