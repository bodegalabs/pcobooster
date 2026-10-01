import { once } from "node:events";

import type {
  SharedReadCodec,
  SharedReadKeys,
  SharedReadSession,
} from "@pcobooster/api/planning-center/services/shared-read-store";

/**
 * A load in flight, which only callers in the request that started it may join: workerd ties
 * I/O to the request that started it, so when that request ends or is cancelled, a caller in
 * another request awaiting the load would never settle.
 */
interface InFlightLoad<T> {
  /** Shared with the load, which shortens it on a shared-tier hit. */
  expiry: { at: number };
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
  settled: boolean;
}

/** The in-memory tier, shared by every request an isolate serves. */
interface ReadCacheMemory<T> {
  /** Loaded values: plain data, never I/O objects, so every request may read them. */
  readonly values: Map<
    string,
    { readonly value: T; readonly expiresAt: number }
  >;
  /** Keys loading in any request, so invalidation can mark those loads stale. */
  readonly loading: Map<string, number>;
  readonly generations: Map<string, number>;
}

/** One request's view of the shared tier for one cache and credential scope. */
export interface SharedReadBinding<Value> {
  readonly session: SharedReadSession;
  readonly keys: SharedReadKeys;
  readonly codec: SharedReadCodec<Value>;
}

const stalePlanningCenterCacheError = new Error(
  "Planning Center cache entry was invalidated while loading"
);

const abortError = () =>
  new DOMException("The operation was aborted", "AbortError");

/**
 * Caches Planning Center reads in memory for the isolate and coalesces concurrent loads within
 * one request. Each request reads through its own view (`forRequest`), so it never awaits a load
 * another request started; concurrent misses in different requests each load. A view made by
 * `withSharedTier` also reads through and fills the shared tier, so other isolates reuse its
 * loads.
 */
export class PlanningCenterReadCache<T> {
  private readonly memory: ReadCacheMemory<T>;
  private readonly shared: SharedReadBinding<T> | undefined;
  private readonly inFlight: Map<string, InFlightLoad<T>>;

  constructor(
    memory?: ReadCacheMemory<T>,
    shared?: SharedReadBinding<T>,
    inFlight?: Map<string, InFlightLoad<T>>
  ) {
    this.memory = memory ?? {
      values: new Map(),
      loading: new Map(),
      generations: new Map(),
    };
    this.shared = shared;
    this.inFlight = inFlight ?? new Map<string, InFlightLoad<T>>();
  }

  /** The same loaded values, with loads coalesced only among this view's callers. */
  forRequest(): PlanningCenterReadCache<T> {
    return new PlanningCenterReadCache(this.memory, this.shared);
  }

  /**
   * This view, backed for its request by the shared tier. Only caches that no mutation
   * invalidates may use it: the shared tier cannot be invalidated across isolates.
   */
  withSharedTier(binding: SharedReadBinding<T>): PlanningCenterReadCache<T> {
    return new PlanningCenterReadCache(this.memory, binding, this.inFlight);
  }

  private bumpGeneration(key: string): void {
    this.memory.generations.set(
      key,
      (this.memory.generations.get(key) ?? 0) + 1
    );
  }

  private countLoading(key: string, delta: 1 | -1): void {
    const count = (this.memory.loading.get(key) ?? 0) + delta;
    if (count === 0) {
      this.memory.loading.delete(key);
    } else {
      this.memory.loading.set(key, count);
    }
  }

  async get(
    key: string,
    ttlMs: number,
    load: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal?.aborted === true) {
      throw abortError();
    }

    const now = Date.now();
    const loaded = this.memory.values.get(key);
    if (loaded !== undefined && loaded.expiresAt > now) {
      return loaded.value;
    }

    let entry = this.inFlight.get(key);
    if (entry === undefined || entry.controller.signal.aborted) {
      const generation = this.memory.generations.get(key) ?? 0;
      const controller = new AbortController();
      const expiry = { at: now + ttlMs };
      const createdEntry: InFlightLoad<T> = {
        expiry,
        promise: this.load(key, load, {
          signal: controller.signal,
          generation,
          expiry,
        }),
        controller,
        waiters: 0,
        settled: false,
      };
      entry = createdEntry;
      this.inFlight.set(key, createdEntry);
      this.countLoading(key, 1);
      void this.observeEntry(key, createdEntry);
    }

    try {
      const value = await PlanningCenterReadCache.awaitEntry(entry, signal);
      return value;
    } catch (error) {
      if (error === stalePlanningCenterCacheError) {
        return await this.get(key, ttlMs, load, signal);
      }
      throw error;
    }
  }

  private async load(
    key: string,
    load: (signal?: AbortSignal) => Promise<T>,
    {
      signal,
      generation,
      expiry,
    }: { signal: AbortSignal; generation: number; expiry: { at: number } }
  ): Promise<T> {
    const value = await this.loadThroughSharedTier(key, load, signal, expiry);
    if ((this.memory.generations.get(key) ?? 0) !== generation) {
      throw stalePlanningCenterCacheError;
    }
    if (!signal.aborted) {
      this.memory.values.set(key, { value, expiresAt: expiry.at });
    }
    return value;
  }

  private async loadThroughSharedTier(
    key: string,
    load: (signal?: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    expiry: { at: number }
  ): Promise<T> {
    const { shared } = this;
    if (shared === undefined) {
      return await load(signal);
    }

    const stored = await shared.session.read(shared.keys, key);
    if (signal.aborted) {
      throw abortError();
    }
    const storedValue =
      stored === null ? null : shared.codec.decode(stored.value);
    if (stored !== null && storedValue !== null) {
      // Another isolate loaded it earlier; it expires on that load's schedule.
      expiry.at = Math.min(expiry.at, stored.expiresAt);
      return storedValue;
    }

    const value = await load(signal);
    if (!signal.aborted) {
      shared.session.write(shared.keys, key, {
        expiresAt: expiry.at,
        value: shared.codec.encode(value),
      });
    }
    return value;
  }

  private static async awaitEntry<Value>(
    entry: InFlightLoad<Value>,
    signal?: AbortSignal
  ): Promise<Value> {
    entry.waiters += 1;
    try {
      return await PlanningCenterReadCache.awaitWithSignal(
        entry.promise,
        signal
      );
    } finally {
      entry.waiters -= 1;
      if (entry.waiters === 0 && !entry.settled) {
        entry.controller.abort();
      }
    }
  }

  private async observeEntry(
    key: string,
    entry: InFlightLoad<T>
  ): Promise<void> {
    try {
      await entry.promise;
    } catch {
      // The waiting callers receive the original failure.
    } finally {
      entry.settled = true;
      this.countLoading(key, -1);
      if (this.inFlight.get(key) === entry) {
        this.inFlight.delete(key);
      }
    }
  }

  private static async awaitWithSignal<Value>(
    promise: Promise<Value>,
    signal?: AbortSignal
  ): Promise<Value> {
    if (signal === undefined) {
      return await promise;
    }
    if (signal.aborted) {
      throw abortError();
    }

    const listenerController = new AbortController();
    const rejectOnAbort = async (): Promise<never> => {
      await once(signal, "abort", { signal: listenerController.signal });
      throw abortError();
    };
    try {
      return await Promise.race([promise, rejectOnAbort()]);
    } finally {
      listenerController.abort();
    }
  }

  /**
   * Drops matching values for every request and marks matching loads stale, including loads in
   * other requests, whose callers then load again.
   */
  deleteWhere(matches: (key: string) => boolean) {
    if (this.shared !== undefined) {
      // Other isolates would keep serving the stale entry until it expired.
      throw new Error(
        "A Planning Center cache backed by the shared tier cannot be invalidated"
      );
    }
    const keys = new Set([
      ...this.memory.values.keys(),
      ...this.memory.loading.keys(),
    ]);
    for (const key of keys) {
      if (matches(key)) {
        this.bumpGeneration(key);
        this.memory.values.delete(key);
        this.inFlight.delete(key);
      }
    }
  }
}

export const stableParams = (params: Record<string, string> = {}): string =>
  JSON.stringify(
    Object.keys(params)
      .toSorted()
      .map((key) => [key, params[key]])
  );
