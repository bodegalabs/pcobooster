/**
 * The People reads through the product client, keyed by account scope and the procedure tag so
 * the disk cache encodes each with its success schema (`query-persistence.ts`). Partial answers
 * follow their continuation until complete, failing typed when a call makes no progress.
 */
import { callForQuery, speculativeQuery } from "@pcobooster/client/query";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient, QueryFunctionContext } from "@tanstack/react-query";

import type { ProductClientContextValue } from "../../app-shell/queries";
import type { PlanReadContext } from "../plan/reads";
import type { Activity, ActivityBatch, PersonDetail, Roster } from "./types";

/** The roster changes when teams change: rarely. */
const ROSTER_STALE_MS = 300_000;
const ACTIVITY_STALE_MS = 120_000;
const PERSON_STALE_MS = 120_000;
const BLOCKOUTS_STALE_MS = 120_000;
/** Follow-up calls one partial read may make before it counts as stalled. */
export const CONTINUATION_CALL_LIMIT = 20;

const ACTIVITY_TAG = "people.dashboardActivity";
const PERSON_TAG = "people.dashboardPerson";

/** A continuation that left every person or page where it was: calling again would loop. */
export class ContinuationStalledError extends Error {
  override readonly name = "ContinuationStalledError";
  override readonly message =
    "Planning Center stopped making progress. Try again in a moment.";
  readonly operation: string;
  constructor(operation: string) {
    super();
    this.operation = operation;
  }
}

export const peopleKeys = {
  roster: (scope: string) => [scope, "people.dashboardRoster"] as const,
  /** Every activity batch in the account, for the person screen's placeholder. */
  activityFamily: (scope: string) => [scope, ACTIVITY_TAG] as const,
  activity: (scope: string, personIds: readonly string[]) =>
    [scope, ACTIVITY_TAG, [...personIds]] as const,
  person: (scope: string, personId: string, month: string | null) =>
    [scope, PERSON_TAG, personId, month] as const,
  blockouts: (scope: string, personId: string) =>
    [scope, "people.blockouts", personId] as const,
};

type ActivityBudget = ActivityBatch["requestBudget"];

const addBudgets = (a: ActivityBudget, b: ActivityBudget): ActivityBudget => ({
  limit: b.limit,
  planningCenterRequests: a.planningCenterRequests + b.planningCenterRequests,
  scheduleRequests: a.scheduleRequests + b.scheduleRequests,
  planTimeRequests: a.planTimeRequests + b.planTimeRequests,
});

/**
 * The activity for `personIds`, following `deferredPersonIds` until the batch is complete. Each
 * call is its own Worker invocation within the per-call request budget; a call that defers every
 * person it was asked for made no progress. The answer is one complete batch, so it persists
 * under the procedure's own schema.
 */
export const fetchActivity = async (
  read: PlanReadContext,
  personIds: readonly string[],
  context: QueryFunctionContext,
  calls = 1
): Promise<ActivityBatch> => {
  const asked = [...personIds];
  const batch = await callForQuery(context, read.client, (api) =>
    api.people.dashboardActivity({ query: { personIds: asked } })
  );
  if (batch.deferredPersonIds.length === 0) {
    return batch;
  }
  if (
    batch.deferredPersonIds.length >= asked.length ||
    calls >= CONTINUATION_CALL_LIMIT
  ) {
    throw new ContinuationStalledError(ACTIVITY_TAG);
  }
  const rest = await fetchActivity(
    read,
    batch.deferredPersonIds,
    context,
    calls + 1
  );
  return {
    generatedAt: rest.generatedAt,
    people: [...batch.people, ...rest.people],
    deferredPersonIds: [],
    requestBudget: addBudgets(batch.requestBudget, rest.requestBudget),
  };
};

/**
 * A person's month, following `continuation` until every rehearsal time is read. The last
 * answer is the whole detail; a continuation that comes back unchanged made no progress.
 */
export const fetchPerson = async (
  read: PlanReadContext,
  { personId, month }: { personId: string; month: string | null },
  context: QueryFunctionContext,
  sent: PersonDetail["continuation"] = null,
  calls = 1
): Promise<PersonDetail> => {
  const detail = await callForQuery(context, read.client, (api) =>
    api.people.dashboardPerson({
      params: { personId },
      payload: {
        month: month ?? undefined,
        continuation: sent ?? undefined,
      },
    })
  );
  const { continuation } = detail;
  if (continuation === null) {
    return detail;
  }
  if (
    JSON.stringify(sent) === JSON.stringify(continuation) ||
    calls >= CONTINUATION_CALL_LIMIT
  ) {
    throw new ContinuationStalledError(PERSON_TAG);
  }
  return await fetchPerson(
    read,
    { personId, month },
    context,
    continuation,
    calls + 1
  );
};

export const peopleReads = {
  roster: ({ client, scope }: PlanReadContext) =>
    queryOptions({
      queryKey: peopleKeys.roster(scope),
      queryFn: async (context): Promise<Roster> =>
        await callForQuery(context, client, (api) =>
          api.people.dashboardRoster()
        ),
      staleTime: ROSTER_STALE_MS,
    }),
  activity: (read: PlanReadContext, personIds: readonly string[]) =>
    queryOptions({
      queryKey: peopleKeys.activity(read.scope, personIds),
      queryFn: async (context) => await fetchActivity(read, personIds, context),
      staleTime: ACTIVITY_STALE_MS,
    }),
  person: (read: PlanReadContext, personId: string, month: string | null) =>
    queryOptions({
      queryKey: peopleKeys.person(read.scope, personId, month),
      queryFn: async (context) =>
        await fetchPerson(read, { personId, month }, context),
      staleTime: PERSON_STALE_MS,
    }),
  /** Future blockouts only (the server filters), so the list stays short. */
  blockouts: ({ client, scope }: PlanReadContext, personId: string) =>
    queryOptions({
      queryKey: peopleKeys.blockouts(scope, personId),
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.people.blockouts({ params: { personId } })
        ),
      staleTime: BLOCKOUTS_STALE_MS,
    }),
};

/** Every activity the cache holds for this account, whichever batch loaded it. */
export const cachedActivities = (
  cache: QueryClient,
  scope: string
): Activity[] =>
  cache
    .getQueriesData<ActivityBatch>({
      queryKey: peopleKeys.activityFamily(scope),
    })
    .flatMap(([, batch]) => batch?.people ?? []);

/**
 * Loads a person's current month ahead of opening them, on a deliberate long press only (never
 * on scrolling past a row). It waits behind on-screen reads in the speculative lane.
 */
export const prefetchPerson = async (
  context: ProductClientContextValue,
  cache: QueryClient,
  personId: string
): Promise<void> => {
  try {
    await context.scheduler.runSpeculative(async () => {
      await cache.query(
        speculativeQuery(peopleReads.person(context, personId, null))
      );
    });
  } catch {
    // A warm-up that fails stays on the query; opening the person reads it again and shows it.
  }
};
