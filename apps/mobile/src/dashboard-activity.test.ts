import { queryKeys } from "@pcobooster/client/query-keys";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { loadDashboardActivity } from "./dashboard-activity";

describe("native activity batch caching", () => {
  it("reuses completed batches when expanding and asks for search matches first", async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.peopleDashboardActivity(["existing"]), []);
    const reads: string[][] = [];
    await loadDashboardActivity({
      client,
      batches: [["search"], ["existing"], ["more"]],
      signal: new AbortController().signal,
      read: async (ids) => {
        await Promise.resolve();
        reads.push(ids);
        return {
          generatedAt: "2026-10-05T12:00:00Z",
          requestBudget: {
            limit: 36,
            planningCenterRequests: 1,
            scheduleRequests: 1,
            planTimeRequests: 0,
          },
          people: [],
          deferredPersonIds: [],
        };
      },
      publish: () => {
        // No UI subscriber.
      },
    });
    expect(reads).toStrictEqual([["search"], ["more"]]);
  });

  it("keeps completed batches while an incomplete continuation fails", async () => {
    const client = new QueryClient();
    await expect(
      loadDashboardActivity({
        client,
        batches: [["complete"], ["partial", "other"]],
        signal: new AbortController().signal,
        read: async (ids) => {
          await Promise.resolve();
          if (ids[0] === "remaining") {
            throw new Error("Provider unavailable");
          }
          return {
            generatedAt: "2026-10-05T12:00:00Z",
            requestBudget: {
              limit: 36,
              planningCenterRequests: 1,
              scheduleRequests: 1,
              planTimeRequests: 0,
            },
            people: [],
            deferredPersonIds: ids[0] === "partial" ? ["remaining"] : [],
          };
        },
        publish: () => {
          // No UI subscriber.
        },
      })
    ).rejects.toThrow("Provider unavailable");
    expect(
      client.getQueryState(queryKeys.peopleDashboardActivity(["complete"]))
        ?.status
    ).toBe("success");
    expect(
      client.getQueryState(
        queryKeys.peopleDashboardActivity(["partial", "other"])
      )
    ).toBeUndefined();
  });
});
