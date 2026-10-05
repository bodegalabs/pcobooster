import type { captureAnalyticsException } from "@pcobooster/analytics/client";
import { makeRpcError } from "@pcobooster/client/testing";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createReadErrorCache } from "./read-error-analytics";

const createClient = (capture: typeof captureAnalyticsException) =>
  new QueryClient({
    queryCache: createReadErrorCache(capture),
    defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
  });

const failObservedRead = async (
  client: QueryClient,
  error: Error,
  options: { queryKey: readonly unknown[]; enabled?: boolean }
) => {
  const observer = new QueryObserver(client, {
    ...options,
    queryFn: async () => await Promise.reject(error),
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    return await observer.refetch();
  } finally {
    unsubscribe();
  }
};

describe("read error reporting", () => {
  it("reports once after retries, deduplicates observers, and sends no provider payload or IDs", async () => {
    const capture = vi.fn<typeof captureAnalyticsException>();
    const client = createClient(capture);
    const error = makeRpcError("BAD_GATEWAY", {
      message: "Private person data",
    });
    const queryKey = ["plan-items", "private-service", "private-plan"];
    const observer = new QueryObserver(client, { queryKey, enabled: false });
    const unsubscribe = observer.subscribe(() => {});
    const result = await failObservedRead(client, error, { queryKey });
    unsubscribe();
    expect(result.error).toBe(error);
    expect(capture).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
      operation: "plan-items",
      error_code: "BAD_GATEWAY",
      outcome: "read_failed",
    });
    const reported = capture.mock.calls[0]?.[0];
    expect(reported?.name).toBe("DataLoadError");
    expect(reported?.message).toBe("Failed to load plan-items (BAD_GATEWAY)");
    expect(reported?.cause).toBeUndefined();
  });

  it("does not alert if a retry recovers", async () => {
    const capture = vi.fn<typeof captureAnalyticsException>();
    const client = createClient(capture);
    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: ["plan-times"],
      queryFn: async () => {
        calls += 1;
        return await (calls === 1
          ? Promise.reject(new Error("Offline"))
          : Promise.resolve([]));
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    const result = await observer.refetch();
    unsubscribe();
    expect(result.data).toStrictEqual([]);
    expect(calls).toBe(2);
    expect(capture).not.toHaveBeenCalled();
  });

  it("reports unobserved prefetches and manually refetched disabled queries", async () => {
    const capture = vi.fn<typeof captureAnalyticsException>();
    const client = createClient(capture);
    const error = new Error("Offline");
    await expect(
      client.query({
        queryKey: ["plan-items"],
        meta: { requestPriority: "speculative" },
        queryFn: async () => await Promise.reject(error),
      })
    ).rejects.toBe(error);
    await failObservedRead(client, error, {
      queryKey: ["plan-times"],
      enabled: false,
    });
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("reports expected faults, rejected aborts, and other query families", async () => {
    const capture = vi.fn<typeof captureAnalyticsException>();
    const client = createClient(capture);
    await Promise.all(
      ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "TOO_MANY_REQUESTS"].map(
        async (code) =>
          await failObservedRead(client, makeRpcError(code), {
            queryKey: ["plans", code],
          })
      )
    );
    const aborted = new Error("Navigation changed");
    aborted.name = "AbortError";
    await failObservedRead(client, aborted, { queryKey: ["plan-times"] });
    await failObservedRead(client, new Error("Offline"), {
      queryKey: ["people-search", "private search"],
    });
    expect(capture).toHaveBeenCalledTimes(6);
    expect(capture.mock.calls.at(-1)?.[1]).toStrictEqual({
      operation: "people-search",
      error_code: "UNKNOWN",
      outcome: "read_failed",
    });
  });

  it("reports active network failures even with cached data", async () => {
    const capture = vi.fn<typeof captureAnalyticsException>();
    const client = createClient(capture);
    client.setQueryData(["team-positions"], []);
    const result = await failObservedRead(
      client,
      new TypeError("fetch failed with private URL"),
      { queryKey: ["team-positions"] }
    );
    expect(result.data).toStrictEqual([]);
    expect(capture).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
      operation: "team-positions",
      error_code: "UNKNOWN",
      outcome: "read_failed",
    });
  });
});
