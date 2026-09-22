import { setTimeout as sleep } from "node:timers/promises";

import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
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
