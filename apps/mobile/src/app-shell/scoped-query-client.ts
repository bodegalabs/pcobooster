/**
 * The query cache for one account scope. It reports each terminal failure once
 * (`diagnostics/api-diagnostics.ts`); TanStack Query calls `onError` only after the last
 * automatic retry.
 *
 * A failure is reported under the diagnostics context its query fetch or mutation started in,
 * pinned once across automatic attempts. The final failed call (`diagnostics/call-failures.ts`)
 * supplies correlation fields, and its origin is only a fallback for work outside those paths. A cache whose
 * scope the session has left reports nothing at all, so a request for account A that settles
 * after a switch to B, a sign-out, or a demo is never reported in the new context. Its calls fail
 * before they are sent (`AppClients.forScope`), so nothing for A is answered into B's cache.
 */
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { DefaultOptions } from "@tanstack/react-query";

import { operationFromQueryKey } from "../diagnostics/api-diagnostics";
import type { ApiFailureContext } from "../diagnostics/api-diagnostics";
import { callFailureOf } from "../diagnostics/call-failures";
import type { ReportOrigin } from "../diagnostics/diagnostics-client";

export interface ScopedQueryReporting {
  readonly report: (cause: unknown, context: ApiFailureContext) => void;
  /** The diagnostics context now (`Diagnostics.origin`). */
  readonly origin: () => ReportOrigin;
  /** The account scope the session is in now. */
  readonly currentScope: () => string;
  /** The device reports a network connection (`onlineManager`). */
  readonly online: () => boolean;
}

export const makeScopedQueryClient = (
  scope: string,
  defaultOptions: DefaultOptions,
  reporting: ScopedQueryReporting
): QueryClient => {
  const mutationOrigins = new WeakMap<object, ReportOrigin>();
  const queryOrigins = new WeakMap<object, ReportOrigin>();
  const report = (
    error: Error,
    context: Omit<ApiFailureContext, "call" | "online" | "origin">,
    startedIn?: ReportOrigin
  ) => {
    if (reporting.currentScope() !== scope) {
      return;
    }
    const call = callFailureOf(error);
    reporting.report(error, {
      ...context,
      call,
      online: reporting.online(),
      origin: startedIn ?? call?.origin ?? null,
    });
  };
  const queryCache = new QueryCache({
    onError: (error, query) => {
      report(
        error,
        {
          operation: operationFromQueryKey(query.queryKey),
          speculative:
            query.meta?.requestPriority === "speculative" &&
            query.getObserversCount() === 0,
        },
        queryOrigins.get(query)
      );
    },
  });
  // A fetch action begins one logical execution, before its first queryFn call. Retries emit
  // failed/continue actions, so their final call identity cannot renew consent after a purge.
  // A later refetch emits a new fetch action and gets the newly authorized context.
  queryCache.subscribe((event) => {
    if (event.type === "updated" && event.action.type === "fetch") {
      queryOrigins.set(event.query, reporting.origin());
    }
  });
  return new QueryClient({
    defaultOptions,
    queryCache,
    mutationCache: new MutationCache({
      onMutate: (_variables, mutation) => {
        mutationOrigins.set(mutation, reporting.origin());
      },
      onError: (error, _variables, _result, mutation) => {
        report(
          error,
          { operation: null, speculative: false },
          mutationOrigins.get(mutation)
        );
      },
    }),
  });
};
