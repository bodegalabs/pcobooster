import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { readBatches, readProgressively } from "./progressive";
import { dehydrateSettledQueries } from "./query-persistence";

describe("Native progressive reads", () => {
  it("retains visible successful pages when a later provider page fails", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = ["features"];
    const controller = new AbortController();
    const values = { people: false, chordCharts: false };
    await expect(
      client.query({
        queryKey: key,
        queryFn: async () => {
          await readProgressively({
            initial: 0,
            signal: controller.signal,
            read: async (cursor) => {
              if (cursor === 1) {
                throw new Error("Provider rate limit");
              }
              return await Promise.resolve({
                people: true,
                chordCharts: false,
              });
            },
            publish: (page) => {
              Object.assign(values, page);
              client.setQueryData(key, { ...values });
              expect(dehydrateSettledQueries(client).queries).toStrictEqual([]);
            },
            continuation: (cursor) => cursor + 1,
          });
          return values;
        },
      })
    ).rejects.toThrow("Provider rate limit");
    expect(client.getQueryData(key)).toStrictEqual({
      people: true,
      chordCharts: false,
    });
    expect(client.getQueryState(key)?.status).toBe("error");
    expect(dehydrateSettledQueries(client).queries).toStrictEqual([]);
    client.setQueryData(key, { ...values });
    expect(dehydrateSettledQueries(client).queries).toHaveLength(1);
  });

  it("starts at most two batches and does not start another wave after cancellation", async () => {
    const controller = new AbortController();
    const started: number[] = [];
    await expect(
      readBatches({
        inputs: [1, 2, 3, 4],
        signal: controller.signal,
        read: async (value) => {
          started.push(value);
          controller.abort();
          await Promise.resolve();
        },
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(started).toStrictEqual([1, 2]);
  });
});
