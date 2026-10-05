import { describe, expect, it } from "vitest";

import { decodeCacheValue, encodeCacheValue } from "./cache-codec";

describe("Native cache storage", () => {
  it("round trips Date values without changing ISO string fields", () => {
    const date = "2026-10-05T01:00:00.000Z";
    const cache = {
      catalog: { sortDate: new Date(date) },
      candidateHistory: { date },
      generatedAt: date,
    };
    const stored = JSON.stringify(encodeCacheValue(cache));
    const decoded: unknown = JSON.parse(stored);
    expect(decodeCacheValue(decoded)).toStrictEqual(cache);
  });
});
