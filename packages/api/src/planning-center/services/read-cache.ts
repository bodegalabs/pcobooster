interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
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

  async get(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing !== undefined && existing.expiresAt > now) {
      return await existing.promise;
    }

    const generation = this.generations.get(key) ?? 0;
    const promise = (async () => {
      const value = await load();
      if ((this.generations.get(key) ?? 0) !== generation) {
        throw stalePlanningCenterCacheError;
      }
      return value;
    })();

    this.entries.set(key, {
      expiresAt: now + ttlMs,
      promise,
    });

    try {
      return await promise;
    } catch (error) {
      const current = this.entries.get(key);
      if (current?.promise === promise) {
        this.entries.delete(key);
      }
      if (error === stalePlanningCenterCacheError) {
        return await this.get(key, ttlMs, load);
      }
      throw error;
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
