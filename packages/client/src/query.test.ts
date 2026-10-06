import { TransportFailure } from "@pcobooster/client/product-client";
import {
  callForQuery,
  queryCallPriority,
  retryTransientReadFailure,
  speculativeQuery,
} from "@pcobooster/client/query";
import type { QueryCallOptions } from "@pcobooster/client/query";
import { ExternalServiceFailure } from "@pcobooster/contracts/faults/external-service-failure";
import { Forbidden } from "@pcobooster/contracts/faults/forbidden";
import { InternalError } from "@pcobooster/contracts/faults/internal-error";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { Unauthenticated } from "@pcobooster/contracts/faults/unauthenticated";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import type { QueryFunctionContext } from "@tanstack/query-core";
import { describe, expect, it } from "vitest";

const deferred = () => Promise.withResolvers<null>();

const queryKey = ["plan-items", "st-1", "plan-1"] as const;

/** Runs `queryFn` the way TanStack Query does and records each call's priority. */
const setupQuery = (
  respond: (options: QueryCallOptions) => Promise<string>
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const priorities: (string | undefined)[] = [];
  const options = {
    queryKey,
    queryFn: async (context: QueryFunctionContext) =>
      await callForQuery(context, async (callOptions) => {
        priorities.push(callOptions.priority);
        return await respond(callOptions);
      }),
  };
  return { queryClient, options, priorities };
};

const rateLimited = () =>
  new RateLimited({ message: "held back", service: "planning-center" });

describe(callForQuery, () => {
  it("sends a query on screen as interactive", async () => {
    const { queryClient, options, priorities } = setupQuery(
      async () => await Promise.resolve("items")
    );
    await expect(queryClient.query(options)).resolves.toBe("items");
    expect(priorities).toStrictEqual(["interactive"]);
  });

  it("sends a prefetch nobody observes as speculative", async () => {
    const { queryClient, options, priorities } = setupQuery(
      async () => await Promise.resolve("items")
    );
    await queryClient.query(speculativeQuery(options));
    expect(priorities).toStrictEqual(["speculative"]);
  });

  it("sends a held-back prefetch again as interactive once the user opened it", async () => {
    const response = deferred();
    let first = true;
    const { queryClient, options, priorities } = setupQuery(async () => {
      if (first) {
        first = false;
        await response.promise;
        throw rateLimited();
      }
      return "items";
    });

    const prefetch = queryClient.query(speculativeQuery(options));
    // The user opens the Plan tab while the prefetch is still out.
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {
      // Mounted, like useQuery.
    });
    response.resolve(null);

    await expect(prefetch).resolves.toBe("items");
    expect(priorities).toStrictEqual(["speculative", "interactive"]);
    unsubscribe();
  });

  it("lets a held-back prefetch fail when nobody opened it", async () => {
    const { queryClient, options, priorities } = setupQuery(async () => {
      await Promise.resolve();
      throw rateLimited();
    });
    await expect(
      queryClient.query(speculativeQuery(options))
    ).rejects.toBeInstanceOf(RateLimited);
    expect(priorities).toStrictEqual(["speculative"]);
  });

  it("does not repeat a speculative call that failed for another reason", async () => {
    const response = deferred();
    const failure = new ExternalServiceFailure({
      message: "down",
      service: "planning-center",
    });
    const { queryClient, options, priorities } = setupQuery(async () => {
      await response.promise;
      throw failure;
    });
    const prefetch = queryClient.query(speculativeQuery(options));
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {
      // Mounted, like useQuery.
    });
    response.resolve(null);

    await expect(prefetch).rejects.toBe(failure);
    expect(priorities).toStrictEqual(["speculative"]);
    unsubscribe();
  });

  it("sends a prefetch of a query already on screen as interactive", async () => {
    const { queryClient, options, priorities } = setupQuery(
      async () => await Promise.resolve("items")
    );
    const observer = new QueryObserver(queryClient, {
      ...options,
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {
      // Mounted but waiting its turn, like a gated detail batch.
    });
    await queryClient.query(speculativeQuery(options));
    expect(priorities).toStrictEqual(["interactive"]);
    unsubscribe();
  });
});

describe(queryCallPriority, () => {
  it("treats queries without the speculative mark as interactive", () => {
    const queryClient = new QueryClient();
    expect(
      queryCallPriority({
        client: queryClient,
        queryKey,
        meta: undefined,
        signal: new AbortController().signal,
      })
    ).toBe("interactive");
  });
});

describe(retryTransientReadFailure, () => {
  it.each([
    [
      "an external service failure",
      new ExternalServiceFailure({
        message: "down",
        service: "planning-center",
      }),
    ],
    ["an internal error", new InternalError({})],
    [
      "a transport failure",
      new TransportFailure({ tag: "health", reason: "network", cause: null }),
    ],
    ["a failure that is not a call failure", new TypeError("Load failed")],
  ])("retries %s once", (_name, error) => {
    expect(retryTransientReadFailure(0, error)).toBeTruthy();
    expect(retryTransientReadFailure(1, error)).toBeFalsy();
  });

  it.each([
    ["Unauthenticated", new Unauthenticated({ message: "Sign in" })],
    ["Forbidden", new Forbidden({ message: "No access" })],
    ["NotFound", new NotFound({ message: "No plan", resource: "plan" })],
    [
      "RateLimited",
      new RateLimited({ message: "held back", service: "planning-center" }),
    ],
  ])("does not retry %s", (_name, error) => {
    expect(retryTransientReadFailure(0, error)).toBeFalsy();
  });
});
