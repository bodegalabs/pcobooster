import { setTimeout as sleep } from "node:timers/promises";

import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import {
  createMemorySharedReadStore,
  createSharedReadKeys,
  createSharedReadTier,
} from "@pcobooster/api/planning-center/services/shared-read-store";
import type {
  SharedReadCodec,
  SharedReadErrorReporter,
  SharedReadStore,
  SharedReadTier,
} from "@pcobooster/api/planning-center/services/shared-read-store";
import { describe, expect, it, vi } from "vitest";

describe("planning center read cache", () => {
  it("lets a surviving concurrent caller finish when another caller aborts", async () => {
    const cache = new PlanningCenterReadCache<number>();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const deferred = Promise.withResolvers<number>();
    let providerSignal: AbortSignal | undefined;
    const load = vi.fn<(signal?: AbortSignal) => Promise<number>>(
      async (signal) => {
        providerSignal = signal;
        return await deferred.promise;
      }
    );

    const first = cache.get("shared", 60_000, load, firstController.signal);
    const second = cache.get("shared", 60_000, load, secondController.signal);
    firstController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(providerSignal?.aborted).toBeFalsy();
    deferred.resolve(42);
    await expect(second).resolves.toBe(42);
    expect(load).toHaveBeenCalledOnce();
  });

  it("aborts provider loading and does not cache the result when every caller aborts", async () => {
    const cache = new PlanningCenterReadCache<number>();
    const controller = new AbortController();
    const load = vi.fn<(signal?: AbortSignal) => Promise<number>>(
      async (signal) => {
        const deferred = Promise.withResolvers<number>();
        signal?.addEventListener(
          "abort",
          () => {
            deferred.reject(new DOMException("Canceled", "AbortError"));
          },
          { once: true }
        );
        signal?.throwIfAborted();
        return await deferred.promise;
      }
    );

    const pending = cache.get("aborted", 60_000, load, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      cache.get("aborted", 60_000, async () => await Promise.resolve(7))
    ).resolves.toBe(7);
    expect(load).toHaveBeenCalledOnce();
  });

  it("retries when an in-flight load is invalidated", async () => {
    const cache = new PlanningCenterReadCache<number>();
    const key = "plan-times:st-1:plan-1";
    let attempts = 0;
    const load = vi.fn<() => Promise<number>>(async () => {
      attempts += 1;
      if (attempts === 1) {
        await sleep(20);
        return 1;
      }
      return 2;
    });

    const pending = cache.get(key, 60_000, load);
    cache.deleteWhere((entryKey) => entryKey === key);
    await expect(pending).resolves.toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

const SCOPE = "basic:scope-hash";
const numberCodec: SharedReadCodec<number> = {
  encode: String,
  decode: (stored) => {
    const value = Number(stored);
    return Number.isFinite(value) ? value : null;
  },
};
const ignoreErrors: SharedReadErrorReporter = () => {};

/** Stands in for one Worker isolate: its own memory tier over the shared store. */
const isolate = (tier: SharedReadTier) => {
  const cache = new PlanningCenterReadCache<number>();
  return {
    request: () => {
      const session = tier.session();
      return {
        session,
        cache: cache.withSharedTier({
          session,
          keys: createSharedReadKeys(SCOPE, "numbers"),
          codec: numberCodec,
        }),
      };
    },
  };
};

const isolateOver = (store: SharedReadStore) =>
  isolate(createSharedReadTier(store, ignoreErrors));

const loads = (result: number) => async (): Promise<number> =>
  await Promise.resolve(result);

const failingStore = () => ({
  get: vi.fn<SharedReadStore["get"]>(async () => {
    await Promise.resolve();
    throw new Error("KV get() limit exceeded for the day.");
  }),
  put: vi.fn<SharedReadStore["put"]>(async () => {
    await Promise.resolve();
    throw new Error("KV put() limit exceeded for the day.");
  }),
});

describe("planning center read cache shared tier", () => {
  it("serves another isolate's load without calling Planning Center", async () => {
    const store = createMemorySharedReadStore();
    const first = isolateOver(store).request();
    await expect(
      first.cache.get(`${SCOPE}:key`, 60_000, loads(1))
    ).resolves.toBe(1);
    await first.session.settle();

    const load = vi.fn<() => Promise<number>>(loads(2));
    const second = isolateOver(store).request();
    await expect(second.cache.get(`${SCOPE}:key`, 60_000, load)).resolves.toBe(
      1
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("stores only the credential scope hash and a hashed key", async () => {
    const store = createMemorySharedReadStore();
    const { cache, session } = isolateOver(store).request();
    await cache.get(`${SCOPE}:plans?include=series`, 60_000, loads(1));
    await session.settle();

    expect([...store.entries.keys()]).toStrictEqual([
      expect.stringMatching(/^pc1:basic:scope-hash:numbers:[0-9a-f]{64}$/u),
    ]);
  });

  it("rejects keys outside the credential scope", async () => {
    const { cache } = isolateOver(createMemorySharedReadStore()).request();
    const load = vi.fn<() => Promise<number>>(loads(1));
    await expect(cache.get("basic:other:key", 60_000, load)).rejects.toThrow(
      "must start with their credential scope"
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("ignores expired and unrecognized stored entries", async () => {
    const store = createMemorySharedReadStore();
    const keys = createSharedReadKeys(SCOPE, "numbers");
    await store.put(keys.entry(`${SCOPE}:expired`), `${Date.now() - 1}\n1`, {
      expirationTtl: 60,
    });
    await store.put(
      keys.entry(`${SCOPE}:garbled`),
      `${Date.now() + 60_000}\nnot a number`,
      { expirationTtl: 60 }
    );
    const { cache } = isolateOver(store).request();

    await expect(cache.get(`${SCOPE}:expired`, 60_000, loads(2))).resolves.toBe(
      2
    );
    await expect(cache.get(`${SCOPE}:garbled`, 60_000, loads(3))).resolves.toBe(
      3
    );
  });

  it("falls back to Planning Center and reports it when the store fails", async () => {
    const reportError = vi.fn<SharedReadErrorReporter>();
    const { cache, session } = isolate(
      createSharedReadTier(failingStore(), reportError)
    ).request();

    await expect(cache.get(`${SCOPE}:a`, 60_000, loads(1))).resolves.toBe(1);
    await expect(session.settle()).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it("stops calling a failing store for the rest of the cooldown", async () => {
    const store = failingStore();
    const worker = isolate(createSharedReadTier(store, ignoreErrors));
    const first = worker.request();
    await first.cache.get(`${SCOPE}:a`, 60_000, loads(1));
    await first.session.settle();
    const second = worker.request();
    await second.cache.get(`${SCOPE}:b`, 60_000, loads(2));
    await second.session.settle();

    expect(store.get).toHaveBeenCalledOnce();
    expect(store.put).toHaveBeenCalledOnce();
  });

  it("does not store a load that every caller abandoned", async () => {
    const store = createMemorySharedReadStore();
    const { cache, session } = isolateOver(store).request();
    const controller = new AbortController();
    const pending = cache.get(
      `${SCOPE}:aborted`,
      60_000,
      async (signal) => {
        await sleep(10);
        signal?.throwIfAborted();
        return 1;
      },
      controller.signal
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await sleep(20);
    await session.settle();
    expect(store.entries.size).toBe(0);
  });

  it("refuses invalidation, which could not reach other isolates", () => {
    const { cache } = isolateOver(createMemorySharedReadStore()).request();
    expect(() => {
      cache.deleteWhere(() => true);
    }).toThrow("cannot be invalidated");
  });
});
