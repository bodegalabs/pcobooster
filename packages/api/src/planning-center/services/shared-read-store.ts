import { createHash } from "node:crypto";

/**
 * The store behind the shared read tier: a Workers KV namespace in the API Worker and an
 * in-memory fake in tests. Only strings cross this boundary.
 */
export interface SharedReadStore {
  readonly get: (key: string) => Promise<string | null>;
  readonly put: (
    key: string,
    value: string,
    options: { readonly expirationTtl: number }
  ) => Promise<void>;
}

/** One cache entry: its encoded value and when it expires, in epoch milliseconds. */
export interface SharedReadEntry {
  readonly expiresAt: number;
  readonly value: string;
}

/**
 * Converts one cache's values to text and back. `decode` validates what it reads and returns
 * `null` for anything it does not recognize, which is then treated as a miss.
 */
export interface SharedReadCodec<Value> {
  readonly encode: (value: Value) => string;
  readonly decode: (stored: string) => Value | null;
}

/** Store keys for one read cache under one credential scope. */
export interface SharedReadKeys {
  readonly scope: string;
  /** The store key for a cache key, which must start with `scope`. */
  readonly entry: (cacheKey: string) => string;
}

/** The request-scoped half of the shared tier. */
export interface SharedReadSession {
  /** An unexpired stored entry, or `null` on a miss or any store failure. */
  readonly read: (
    keys: SharedReadKeys,
    cacheKey: string
  ) => Promise<SharedReadEntry | null>;
  /** Stores a loaded value in the background of this request. */
  readonly write: (
    keys: SharedReadKeys,
    cacheKey: string,
    entry: SharedReadEntry
  ) => void;
  /** Waits for this request's writes. Never rejects. */
  readonly settle: () => Promise<void>;
}

/** The isolate-wide half of the shared tier. */
export interface SharedReadTier {
  /** One session per request: its store I/O stays inside that request, which awaits it. */
  readonly session: () => SharedReadSession;
}

export type SharedReadErrorReporter = (message: string, error: Error) => void;

/** KV rejects shorter expirations. Entries carry their exact expiry, checked on read. */
const MINIMUM_KV_EXPIRATION_SECONDS = 60;
/**
 * After a failed read or write, the isolate stops using that half of the store for a while.
 * Workers Free caps KV at 1,000 writes and 100,000 reads a day, and every KV call counts
 * toward the 50-subrequest limit, so a failing store must not keep spending them.
 */
export const SHARED_READ_FAILURE_COOLDOWN_MS = 15 * 60 * 1000;
const KEY_VERSION = "pc1";
const ENTRY_SEPARATOR = "\n";

/** Stored as `<expiresAt>\n<encoded value>`, so the value is never escaped twice. */
const serializeEntry = ({ expiresAt, value }: SharedReadEntry): string =>
  `${expiresAt}${ENTRY_SEPARATOR}${value}`;

const parseEntry = (stored: string): SharedReadEntry | null => {
  const separator = stored.indexOf(ENTRY_SEPARATOR);
  const expiresAt = Number(stored.slice(0, separator));
  if (separator === -1 || !Number.isFinite(expiresAt)) {
    return null;
  }
  return { expiresAt, value: stored.slice(separator + 1) };
};

/**
 * The scope is the credential's hash (`PlanningCenterCoreClient.getCacheScope()`), never the
 * credential itself, and every cache key must start with it, so no entry can be read under
 * another credential. Hashing bounds the key under KV's 512-byte limit.
 */
export const createSharedReadKeys = (
  scope: string,
  cacheName: string
): SharedReadKeys => {
  const prefix = `${KEY_VERSION}:${scope}:${cacheName}`;
  return {
    scope,
    entry: (cacheKey) => {
      if (!cacheKey.startsWith(`${scope}:`)) {
        throw new Error(
          "Planning Center cache keys must start with their credential scope"
        );
      }
      return `${prefix}:${createHash("sha256").update(cacheKey).digest("hex")}`;
    },
  };
};

/**
 * workerd ties store I/O to the request that started it, so no session shares a store promise
 * with another request, and each request awaits `settle()` before it responds so its writes
 * are not cancelled. A store failure never fails a read: it is reported, the read falls back to
 * Planning Center, and the isolate pauses that half of the store.
 */
export const createSharedReadTier = (
  store: SharedReadStore,
  reportError: SharedReadErrorReporter
): SharedReadTier => {
  let readsPausedUntil = 0;
  let writesPausedUntil = 0;

  const session = (): SharedReadSession => {
    const pending = new Set<Promise<void>>();

    const settle = async (): Promise<void> => {
      if (pending.size === 0) {
        return;
      }
      const settling = [...pending];
      await Promise.allSettled(settling);
      for (const work of settling) {
        pending.delete(work);
      }
      // A load that finished while settling may have started another write.
      await settle();
    };

    return {
      read: async (keys, cacheKey) => {
        const key = keys.entry(cacheKey);
        if (Date.now() < readsPausedUntil) {
          return null;
        }
        let stored: string | null = null;
        try {
          stored = await store.get(key);
        } catch (error) {
          readsPausedUntil = Date.now() + SHARED_READ_FAILURE_COOLDOWN_MS;
          reportError(
            "Planning Center shared cache read failed",
            error instanceof Error
              ? error
              : new Error("KV read failed", { cause: error })
          );
          return null;
        }
        const entry = stored === null ? null : parseEntry(stored);
        return entry === null || entry.expiresAt <= Date.now() ? null : entry;
      },
      write: (keys, cacheKey, entry) => {
        const key = keys.entry(cacheKey);
        if (Date.now() < writesPausedUntil) {
          return;
        }
        const expirationTtl = Math.max(
          MINIMUM_KV_EXPIRATION_SECONDS,
          Math.ceil((entry.expiresAt - Date.now()) / 1000)
        );
        const writeEntry = async () => {
          try {
            await store.put(key, serializeEntry(entry), { expirationTtl });
          } catch (error) {
            writesPausedUntil = Date.now() + SHARED_READ_FAILURE_COOLDOWN_MS;
            reportError(
              "Planning Center shared cache write failed",
              error instanceof Error
                ? error
                : new Error("KV write failed", { cause: error })
            );
          }
        };
        pending.add(writeEntry());
      },
      settle,
    };
  };

  return { session };
};

/** A `SharedReadStore` in memory that honors expiration, for tests. */
export const createMemorySharedReadStore = (): SharedReadStore & {
  readonly entries: Map<string, { value: string; expiresAt: number }>;
} => {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  return {
    entries,
    get: async (key) => {
      await Promise.resolve();
      const entry = entries.get(key);
      if (entry === undefined || entry.expiresAt <= Date.now()) {
        return null;
      }
      return entry.value;
    },
    put: async (key, value, { expirationTtl }) => {
      await Promise.resolve();
      entries.set(key, {
        value,
        expiresAt: Date.now() + expirationTtl * 1000,
      });
    },
  };
};
