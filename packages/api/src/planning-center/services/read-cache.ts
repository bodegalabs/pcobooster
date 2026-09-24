import { once } from "node:events";

import type {
  SharedReadCodec,
  SharedReadKeys,
  SharedReadSession,
} from "@pcobooster/api/planning-center/services/shared-read-store";

interface CacheEntry<T> {
  /** Shared with the entry's load, which shortens it on a shared-tier hit. */
  expiry: { at: number };
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
  settled: boolean;
}

/** The in-memory tier, shared by every view of one cache in an isolate. */
interface ReadCacheMemory<T> {
  readonly entries: Map<string, CacheEntry<T>>;
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
 * Coalesces and caches Planning Center reads in memory. A view made by `withSharedTier` also
 * reads through and fills the shared tier, so other isolates reuse its loads.
 */
export class PlanningCenterReadCache<T> {
  private readonly memory: ReadCacheMemory<T>;
  private readonly shared: SharedReadBinding<T> | undefined;

  constructor(memory?: ReadCacheMemory<T>, shared?: SharedReadBinding<T>) {
    this.memory = memory ?? { entries: new Map(), generations: new Map() };
    this.shared = shared;
  }

  /**
   * The same in-memory cache, backed for one request by the shared tier. Only caches that no
   * mutation invalidates may use it: the shared tier cannot be invalidated across isolates.
   */
  withSharedTier(binding: SharedReadBinding<T>): PlanningCenterReadCache<T> {
    return new PlanningCenterReadCache(this.memory, binding);
  }

  private bumpGeneration(key: string): void {
    this.memory.generations.set(
      key,
      (this.memory.generations.get(key) ?? 0) + 1
    );
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
    let entry = this.memory.entries.get(key);
    if (
      entry === undefined ||
      entry.expiry.at <= now ||
      entry.controller.signal.aborted
    ) {
      const generation = this.memory.generations.get(key) ?? 0;
      const controller = new AbortController();
      const expiry = { at: now + ttlMs };
      const createdEntry: CacheEntry<T> = {
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
      this.memory.entries.set(key, createdEntry);
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
    const { shared } = this;
    if (shared !== undefined) {
      const stored = await shared.session.read(shared.keys, key);
      if (signal.aborted) {
        throw abortError();
      }
      const value = stored === null ? null : shared.codec.decode(stored.value);
      if (stored !== null && value !== null) {
        // Another isolate loaded it earlier; it expires on that load's schedule.
        expiry.at = Math.min(expiry.at, stored.expiresAt);
        return value;
      }
    }

    const value = await load(signal);
    if ((this.memory.generations.get(key) ?? 0) !== generation) {
      throw stalePlanningCenterCacheError;
    }
    if (shared !== undefined && !signal.aborted) {
      shared.session.write(shared.keys, key, {
        expiresAt: expiry.at,
        value: shared.codec.encode(value),
      });
    }
    return value;
  }

  private static async awaitEntry<Value>(
    entry: CacheEntry<Value>,
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

  private async observeEntry(key: string, entry: CacheEntry<T>): Promise<void> {
    let succeeded = false;
    try {
      await entry.promise;
      succeeded = true;
    } catch {
      // The waiting callers receive the original failure.
    } finally {
      entry.settled = true;
      if (!succeeded && this.memory.entries.get(key) === entry) {
        this.memory.entries.delete(key);
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

  deleteWhere(matches: (key: string) => boolean) {
    if (this.shared !== undefined) {
      // Other isolates would keep serving the stale entry until it expired.
      throw new Error(
        "A Planning Center cache backed by the shared tier cannot be invalidated"
      );
    }
    for (const key of this.memory.entries.keys()) {
      if (matches(key)) {
        this.bumpGeneration(key);
        this.memory.entries.delete(key);
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
