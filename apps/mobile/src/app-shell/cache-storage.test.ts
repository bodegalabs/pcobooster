import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeCacheStorage } from "./cache-storage";
import {
  serializeQueryCache,
  deserializeQueryCache,
  queryCacheKey,
} from "./query-persistence";

const setup = () => {
  const items = new Map<string, string>();
  const storage = makeCacheStorage(
    {
      getItem: async (key) => await Promise.resolve(items.get(key) ?? null),
      setItem: async (key, value) => {
        items.set(key, value);
        await Promise.resolve();
      },
      removeItem: async (key) => {
        items.delete(key);
        await Promise.resolve();
      },
    },
    async (matches) => {
      await Promise.resolve();
      for (const key of items.keys()) {
        if (matches(key)) {
          items.delete(key);
        }
      }
    }
  );
  return { items, storage };
};

describe(makeCacheStorage, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not resurrect a forgotten person's cache from a trailing persister write", async () => {
    vi.useFakeTimers();
    const { items, storage } = setup();
    const key = queryCacheKey("https://pcobooster.com", "user:u1:a1:old");
    const persister = createAsyncStoragePersister({
      storage: storage.forScope(key),
      key,
      throttleTime: 1000,
      serialize: serializeQueryCache,
      deserialize: deserializeQueryCache,
    });
    const client = new QueryClient();
    client.setQueryData(
      ["user:u1:a1:old", "search.recent"],
      [{ kind: "query", text: "private search" }]
    );
    await persister.persistClient({
      timestamp: 1,
      buster: "test",
      clientState: dehydrate(client),
    });
    const trailing = persister.persistClient({
      timestamp: 2,
      buster: "test",
      clientState: dehydrate(client),
    });
    await storage.forget(["u1"]);
    await vi.advanceTimersByTimeAsync(1500);
    await trailing;
    expect(items.has(key)).toBeFalsy();
    // A new sign-in may persist, but the old provider remains revoked.
    const newKey = queryCacheKey("https://pcobooster.com", "user:u1:a1:new");
    await storage.forScope(newKey).setItem(newKey, "new data");
    const afterForget = persister.persistClient({
      timestamp: 2,
      buster: "test",
      clientState: dehydrate(client),
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(items.has(key)).toBeFalsy();
    await afterForget;
    expect(items.get(newKey)).toBe("new data");
  });

  it("keeps restored data isolated across people, organizations and the demo", async () => {
    vi.useFakeTimers();
    const { storage } = setup();
    const scopes = [
      "user:u1:a1:token1",
      "user:u1:a2:token1",
      "user:u2:a1:token2",
      "demo:demo-token",
    ];
    await Promise.all(
      scopes.map(async (scope) => {
        const key = queryCacheKey("https://pcobooster.com", scope);
        const persister = createAsyncStoragePersister({
          storage: storage.forScope(key),
          key,
          throttleTime: 0,
        });
        const cache = new QueryClient();
        cache.setQueryData([scope, "read"], { owner: scope });
        await persister.persistClient({
          timestamp: 1,
          buster: "test",
          clientState: dehydrate(cache),
        });
      })
    );
    await vi.advanceTimersByTimeAsync(10);
    await Promise.all(
      scopes.map(async (scope) => {
        const key = queryCacheKey("https://pcobooster.com", scope);
        const persister = createAsyncStoragePersister({
          storage: storage.forScope(key),
          key,
        });
        const restored = await persister.restoreClient();
        expect(restored).toBeDefined();
        const cache = new QueryClient();
        if (restored !== undefined) {
          hydrate(cache, restored.clientState);
        }
        expect(cache.getQueryData([scope, "read"])).toStrictEqual({
          owner: scope,
        });
        for (const other of scopes.filter((value) => value !== scope)) {
          expect(cache.getQueryData([other, "read"])).toBeUndefined();
        }
      })
    );
  });
});
