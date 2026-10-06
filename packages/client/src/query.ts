/**
 * TanStack Query glue for product calls, shared by web and Expo: which lane a query's call goes
 * out in (`speculativeQuery`, `callForQuery`) and which read failures are worth one retry.
 */
import { failureStatus } from "@pcobooster/client/product-client";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import type { RequestPriority } from "@pcobooster/contracts/request-priority";
import type { QueryFunctionContext, QueryMeta } from "@tanstack/query-core";

const SPECULATIVE_META: QueryMeta = { requestPriority: "speculative" };

/**
 * Marks a prefetch speculative. Its calls go out in the speculative lane until something on
 * screen observes the query; a mounted `useQuery` replaces the options, and with them this mark.
 */
export const speculativeQuery = <Options extends object>(
  options: Options & { meta?: QueryMeta }
): Options & { meta: QueryMeta } => ({
  ...options,
  meta: { ...options.meta, ...SPECULATIVE_META },
});

/**
 * The priority of a query's next call: speculative only while the fetch was started
 * speculatively and nothing on screen observes the query yet.
 */
export const queryCallPriority = ({
  client,
  meta,
  queryKey,
}: QueryFunctionContext): RequestPriority => {
  if (meta?.requestPriority !== "speculative") {
    return "interactive";
  }
  const observers =
    client
      .getQueryCache()
      .find({ queryKey, exact: true })
      ?.getObserversCount() ?? 0;
  return observers > 0 ? "interactive" : "speculative";
};

/**
 * What each product call from a query function passes as its call options. `priority` may be
 * speculative, which `ProductClient.call` accepts for read procedures only, so a query function
 * cannot call a write through `callForQuery`.
 */
export interface QueryCallOptions {
  readonly signal: AbortSignal;
  readonly priority: RequestPriority;
}

/**
 * Makes one product call for a query with the priority it has right now. The API holds back
 * speculative reads when the user's Planning Center budget is mostly spent; if the user opened
 * what was being prefetched in the meantime, the call is sent again as interactive instead of
 * failing on screen.
 */
export const callForQuery = async <Result>(
  context: QueryFunctionContext,
  call: (options: QueryCallOptions) => Promise<Result>
): Promise<Result> => {
  const { signal } = context;
  const priority = queryCallPriority(context);
  try {
    return await call({ signal, priority });
  } catch (error) {
    if (
      priority === "speculative" &&
      error instanceof RateLimited &&
      queryCallPriority(context) === "interactive"
    ) {
      return await call({ signal, priority: "interactive" });
    }
    throw error;
  }
};

const MAX_READ_RETRIES = 1;
const SERVER_ERROR_STATUS = 500;

/**
 * Retries a failed read once, unless the API answered with a 4xx fault. Sign-in, permission,
 * missing-record, and rate-limit answers come back the same on a retry, which would only
 * spend another Planning Center request. Server and network failures may be transient.
 */
export const retryTransientReadFailure = (
  failureCount: number,
  error: Error
): boolean =>
  failureCount < MAX_READ_RETRIES &&
  (failureStatus(error) ?? SERVER_ERROR_STATUS) >= SERVER_ERROR_STATUS;
