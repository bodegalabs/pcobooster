import { setTimeout as sleep } from "node:timers/promises";

import { PlanningCenterReadCache } from "@worship-admin/api/planning-center/services/read-cache";
import { describe, expect, it, vi } from "vitest";

describe("planning center read cache", () => {
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
