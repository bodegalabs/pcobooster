import { once } from "node:events";

interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
  settled: boolean;
}

const stalePlanningCenterCacheError = new Error(
  "Planning Center cache entry was invalidated while loading"
);

export class PlanningCenterReadCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly generations = new Map<string, number>();

  private bumpGeneration(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
  }

  async get(
    key: string,
    ttlMs: number,
    load: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal?.aborted === true) {
      throw new DOMException("The operation was aborted", "AbortError");
    }

    const now = Date.now();
    let entry = this.entries.get(key);
    if (
      entry === undefined ||
      entry.expiresAt <= now ||
      entry.controller.signal.aborted
    ) {
      const generation = this.generations.get(key) ?? 0;
      const controller = new AbortController();
      const promise = (async () => {
        const value = await load(controller.signal);
        if ((this.generations.get(key) ?? 0) !== generation) {
          throw stalePlanningCenterCacheError;
        }
        return value;
      })();
      const createdEntry: CacheEntry<T> = {
        expiresAt: now + ttlMs,
        promise,
        controller,
        waiters: 0,
        settled: false,
      };
      entry = createdEntry;
      this.entries.set(key, createdEntry);
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
      if (!succeeded && this.entries.get(key) === entry) {
        this.entries.delete(key);
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
      throw new DOMException("The operation was aborted", "AbortError");
    }

    const listenerController = new AbortController();
    const rejectOnAbort = async (): Promise<never> => {
      await once(signal, "abort", { signal: listenerController.signal });
      throw new DOMException("The operation was aborted", "AbortError");
    };
    try {
      return await Promise.race([promise, rejectOnAbort()]);
    } finally {
      listenerController.abort();
    }
  }

  deleteWhere(matches: (key: string) => boolean) {
    for (const key of this.entries.keys()) {
      if (matches(key)) {
        this.bumpGeneration(key);
        this.entries.delete(key);
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
