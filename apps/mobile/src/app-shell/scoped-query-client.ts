/**
 * The query cache for one account scope. It reports each terminal failure once
 * (`diagnostics/api-diagnostics.ts`); TanStack Query calls `onError` only after the last
 * automatic retry.
 *
 * A failure is reported under the diagnostics context its work started in: the failed call's
 * (`diagnostics/call-failures.ts`), else the mutation's, pinned when it started. A cache whose
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
      origin: call?.origin ?? startedIn ?? null,
    });
  };
  return new QueryClient({
    defaultOptions,
    queryCache: new QueryCache({
      onError: (error, query) => {
        report(error, {
          operation: operationFromQueryKey(query.queryKey),
          speculative:
            query.meta?.requestPriority === "speculative" &&
            query.getObserversCount() === 0,
        });
      },
    }),
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
