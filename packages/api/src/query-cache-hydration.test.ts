import { QueryClient } from "@tanstack/react-query";
import { hydrateQueryFromCache } from "@worship-admin/api/query-cache-hydration";
import { describe, expect, it } from "vitest";

const key = ["plans", "service-1"] as const;

describe(hydrateQueryFromCache, () => {
  it("restores a cold query with the original freshness timestamp", () => {
    const client = new QueryClient();
    hydrateQueryFromCache(client, key, () => ({
      data: ["saved-plan"],
      savedAt: 1000,
    }));
    expect(client.getQueryData(key)).toStrictEqual(["saved-plan"]);
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(1000);
    client.clear();
  });

  it("keeps live query data authoritative when persistence writes a newer timestamp", () => {
    const client = new QueryClient();
    client.setQueryData(key, ["live-plan"], { updatedAt: 1000 });
    const originalState = client.getQueryState(key);
    hydrateQueryFromCache(client, key, () => ({
      data: ["saved-plan"],
      savedAt: 2000,
    }));
    hydrateQueryFromCache(client, key, () => ({
      data: ["saved-plan"],
      savedAt: 3000,
    }));
    expect(client.getQueryState(key)).toBe(originalState);
    expect(client.getQueryData(key)).toStrictEqual(["live-plan"]);
    client.clear();
  });
});
