import type { PlainStorage } from "../session/credential-store";
import { isQueryCacheKeyFor } from "./query-persistence";

export interface CacheStorage extends PlainStorage {
  readonly removeItem: (key: string) => Promise<void>;
}

export const makeCacheStorage = (
  storage: CacheStorage,
  removeKeys: (matches: (key: string) => boolean) => Promise<void>
) => {
  const leases = new Set<{ key: string; revoked: boolean }>();
  let pending = Promise.resolve();
  const enqueue = async (operation: () => Promise<void>): Promise<void> => {
    const previous = pending;
    const result = (async () => {
      await previous;
      await operation();
    })();
    pending = (async () => {
      try {
        await result;
      } catch {
        /* A failed write must not block later deletion. */
      }
    })();
    await result;
  };
  return {
    forScope: (key: string): CacheStorage => {
      const lease = { key, revoked: false };
      leases.add(lease);
      return {
        getItem: async (entry) => {
          await pending;
          return lease.revoked ? null : await storage.getItem(entry);
        },
        setItem: async (entry, value) => {
          await enqueue(async () => {
            if (!lease.revoked) {
              await storage.setItem(entry, value);
            }
          });
        },
        removeItem: async (entry) => {
          await enqueue(async () => {
            await storage.removeItem(entry);
          });
        },
      };
    },
    forget: async (userIds: readonly string[]): Promise<void> => {
      const matches = (key: string) =>
        userIds.some((id) => isQueryCacheKeyFor(key, id));
      for (const lease of leases) {
        if (matches(lease.key)) {
          lease.revoked = true;
          leases.delete(lease);
        }
      }
      // Delete after in-flight writes; throttled writes check their revoked lease later.
      await enqueue(async () => {
        await removeKeys(matches);
      });
    },
  };
};
