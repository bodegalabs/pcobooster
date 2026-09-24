import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createIntentPrefetcher,
  INTENT_PREFETCH_DWELL_MS,
  isQueryFresh,
} from "./intent-prefetch";

type Deferred = PromiseWithResolvers<null>;

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const setup = ({ fresh = new Set<string>() } = {}) => {
  const calls: string[] = [];
  const deferreds: Deferred[] = [];
  const prefetcher = createIntentPrefetcher<string>({
    dwellMs: INTENT_PREFETCH_DWELL_MS,
    keyOf: (id) => id,
    isFresh: (id) => fresh.has(id),
    prefetch: async (id) => {
      calls.push(id);
      const deferred = Promise.withResolvers<null>();
      deferreds.push(deferred);
      await deferred.promise;
    },
  });
  return { calls, deferreds, prefetcher };
};

const settle = async (deferred: Deferred | undefined) => {
  deferred?.resolve(null);
  await vi.advanceTimersByTimeAsync(0);
};

describe(createIntentPrefetcher, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefetches only after the pointer rests for the full dwell", async () => {
    const { calls, prefetcher } = setup();

    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS - 1);
    expect(calls).toStrictEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toStrictEqual(["a"]);
  });

  it("prefetches nothing when the pointer sweeps across rows", async () => {
    const { calls, prefetcher } = setup();

    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(80);
    prefetcher.end("a");
    prefetcher.start("b");
    await vi.advanceTimersByTimeAsync(80);
    prefetcher.end("b");
    prefetcher.start("c");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS - 1);
    prefetcher.end("c");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS * 2);

    expect(calls).toStrictEqual([]);
  });

  it("restarts the dwell when intent moves to another row without leaving", async () => {
    const { calls, prefetcher } = setup();

    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS - 50);
    prefetcher.start("b");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS - 1);
    expect(calls).toStrictEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toStrictEqual(["b"]);
  });

  it("keeps the dwell running when focus arrives on the hovered row", async () => {
    const { calls, prefetcher } = setup();

    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS - 100);
    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(100);

    expect(calls).toStrictEqual(["a"]);
  });

  it("ignores a leave event for a row that is not pending", async () => {
    const { calls, prefetcher } = setup();

    prefetcher.start("b");
    prefetcher.end("a");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);

    expect(calls).toStrictEqual(["b"]);
  });

  it("cancels a pending dwell", async () => {
    const { calls, prefetcher } = setup();

    prefetcher.start("a");
    prefetcher.cancel();
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);

    expect(calls).toStrictEqual([]);
  });

  it("runs at most one prefetch at a time and drops dwells that end meanwhile", async () => {
    const { calls, deferreds, prefetcher } = setup();

    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);
    prefetcher.start("b");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);
    expect(calls).toStrictEqual(["a"]);

    await settle(deferreds[0]);
    prefetcher.start("c");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);
    expect(calls).toStrictEqual(["a", "c"]);
  });

  it("frees the single flight after a failed prefetch", async () => {
    const { calls, deferreds, prefetcher } = setup();

    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);
    deferreds[0]?.reject(new Error("Planning Center rate limited"));
    await vi.advanceTimersByTimeAsync(0);

    prefetcher.start("b");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);
    expect(calls).toStrictEqual(["a", "b"]);
  });

  it("never prefetches a row whose data is fresh", async () => {
    const { calls, prefetcher } = setup({ fresh: new Set(["a"]) });

    prefetcher.start("a");
    await vi.advanceTimersByTimeAsync(INTENT_PREFETCH_DWELL_MS);

    expect(calls).toStrictEqual([]);
  });
});

describe(isQueryFresh, () => {
  const queryKey = ["people-dashboard-person", "1", null];
  const staleTime = 60_000;

  it("is false for a query that was never loaded", () => {
    expect(isQueryFresh(createQueryClient(), queryKey, staleTime)).toBeFalsy();
  });

  it("is true for data newer than the stale time and false after it", () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKey, { id: "1" }, { updatedAt: 1000 });

    expect(
      isQueryFresh(queryClient, queryKey, staleTime, 1000 + 59_999)
    ).toBeTruthy();
    expect(
      isQueryFresh(queryClient, queryKey, staleTime, 1000 + 60_000)
    ).toBeFalsy();
  });

  it("is false once the query is invalidated", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKey, { id: "1" }, { updatedAt: 1000 });
    await queryClient.invalidateQueries({ queryKey, refetchType: "none" });

    expect(isQueryFresh(queryClient, queryKey, staleTime, 1001)).toBeFalsy();
  });

  it("is true while the query is already fetching", async () => {
    const queryClient = createQueryClient();
    const deferred = Promise.withResolvers<null>();
    const fetching = queryClient.query({
      queryKey,
      queryFn: async () => {
        await deferred.promise;
        return { id: "1" };
      },
    });

    expect(isQueryFresh(queryClient, queryKey, staleTime)).toBeTruthy();
    deferred.resolve(null);
    await fetching;
  });
});
