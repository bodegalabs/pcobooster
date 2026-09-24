import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * How long the pointer or keyboard focus must rest on one target before a prefetch starts.
 * Sweeping the pointer across a list never rests this long, so it prefetches nothing.
 */
export const INTENT_PREFETCH_DWELL_MS = 300;

export interface IntentPrefetcherOptions<Target> {
  dwellMs: number;
  /** Targets with the same key share one dwell timer. */
  keyOf: (target: Target) => string;
  /** True when the target's data is cached and fresh, or already loading. */
  isFresh: (target: Target) => boolean;
  /** Failures are ignored: the destination query owns visible errors. */
  prefetch: (target: Target) => Promise<void>;
}

export interface IntentPrefetcher<Target> {
  /** Pointer entered or focus arrived: start the dwell timer for this target. */
  start: (target: Target) => void;
  /** Pointer left or focus moved away: cancel this target's dwell timer. */
  end: (target: Target) => void;
  /** Cancel any pending dwell timer. An in-flight prefetch keeps running. */
  cancel: () => void;
}

/**
 * Prefetches on clear intent only. A target must hold the pointer or focus for `dwellMs`;
 * at most one prefetch runs at a time, and a dwell that ends while another prefetch runs
 * is dropped rather than queued. Fresh targets are never fetched again.
 */
export const createIntentPrefetcher = <Target>({
  dwellMs,
  keyOf,
  isFresh,
  prefetch,
}: IntentPrefetcherOptions<Target>): IntentPrefetcher<Target> => {
  let pending: { key: string; timer: ReturnType<typeof setTimeout> } | null =
    null;
  let inFlight = false;

  const cancel = () => {
    if (pending === null) {
      return;
    }
    clearTimeout(pending.timer);
    pending = null;
  };

  const run = async (target: Target) => {
    if (inFlight || isFresh(target)) {
      return;
    }
    inFlight = true;
    try {
      await prefetch(target);
    } catch {
      // Prefetching is optional; the destination query surfaces its own errors.
    } finally {
      inFlight = false;
    }
  };

  const start = (target: Target) => {
    const key = keyOf(target);
    if (pending?.key === key) {
      return;
    }
    cancel();
    const timer = setTimeout(() => {
      pending = null;
      void run(target);
    }, dwellMs);
    pending = { key, timer };
  };

  const end = (target: Target) => {
    if (pending?.key === keyOf(target)) {
      cancel();
    }
  };

  return { start, end, cancel };
};

/**
 * True when the query has data newer than `staleTime` that was not invalidated, or is
 * already fetching. Either way a prefetch would add no Planning Center requests.
 */
export const isQueryFresh = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  staleTime: number,
  now: number = Date.now()
): boolean => {
  const state = queryClient.getQueryState(queryKey);
  if (state === undefined) {
    return false;
  }
  if (state.fetchStatus === "fetching") {
    return true;
  }
  return (
    state.dataUpdatedAt > 0 &&
    !state.isInvalidated &&
    now - state.dataUpdatedAt < staleTime
  );
};
