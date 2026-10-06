import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { refreshPlanReads } from "./refresh";

describe("plan refresh recovery", () => {
  it("reports a failed refetch while retaining cached rows, then recovers", async () => {
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryFn = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["updated"]);
    const observer = new QueryObserver(cache, {
      queryKey: ["plan"],
      queryFn,
      initialData: ["cached"],
    });
    const refresh = async () => {
      await refreshPlanReads([async () => await observer.refetch()]);
    };
    await expect(refresh()).rejects.toThrow("offline");
    expect(observer.getCurrentResult().data).toStrictEqual(["cached"]);
    await expect(refresh()).resolves.toBeUndefined();
    expect(observer.getCurrentResult().data).toStrictEqual(["updated"]);
    cache.clear();
  });

  it("waits for every read to finish before reporting a failure", async () => {
    const pending = Promise.withResolvers<{ error: Error | null }>();
    const finished = vi.fn<(error: Error) => void>();
    const refresh = refreshPlanReads([
      async () => await Promise.resolve({ error: new Error("failed") }),
      async () => await pending.promise,
    ]);
    void refresh.catch(finished);
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    pending.resolve({ error: null });
    await expect(refresh).rejects.toThrow("failed");
    expect(finished).toHaveBeenCalledOnce();
  });
});
