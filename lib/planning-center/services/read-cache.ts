interface CacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

export class PlanningCenterReadCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  async get(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.entries.get(key);
    if (existing !== undefined && existing.expiresAt > now) {
      return await existing.promise;
    }

    const promise = load();
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
      throw error;
    }
  }

  deleteWhere(matches: (key: string) => boolean) {
    for (const key of this.entries.keys()) {
      if (matches(key)) {
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
