import { setTimeout as nextTask } from "node:timers/promises";

/** Real TanStack observer lifecycle used by subscribed:false; no native/network side effects. */
import {
  QueryClient,
  QueryObserver,
  focusManager,
} from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

describe("route query observer lifecycle", () => {
  it("keeps a shared visible read alive, then aborts when its last route observer leaves", async () => {
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const signals: AbortSignal[] = [];
    const options = {
      queryKey: ["account", "plan"],
      queryFn: async (context: { signal: AbortSignal }) => {
        signals.push(context.signal);
        const held = Promise.withResolvers<string>();
        context.signal.addEventListener("abort", () => {
          held.reject(new DOMException("Left route", "AbortError"));
        });
        return await held.promise;
      },
    };
    const services = new QueryObserver(cache, options);
    const plan = new QueryObserver(cache, options);
    const leaveServices = services.subscribe(() => {});
    const leavePlan = plan.subscribe(() => {});
    await nextTask();
    leaveServices();
    const [signal] = signals;
    expect(signal?.aborted).toBeFalsy();
    leavePlan();
    expect(signal?.aborted).toBeTruthy();
    cache.clear();
  });

  it("hidden routes do not refetch on invalidation or foreground; restoration reads the stale cache", async () => {
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    cache.mount();
    let sent = 0;
    const observer = new QueryObserver(cache, {
      queryKey: ["account", "services"],
      staleTime: Infinity,
      queryFn: async () => {
        sent += 1;
        return await Promise.resolve(sent);
      },
    });
    const leave = observer.subscribe(() => {});
    await nextTask();
    expect(sent).toBe(1);
    leave();
    await cache.invalidateQueries();
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await nextTask();
    expect(sent).toBe(1);
    const leaveAgain = observer.subscribe(() => {});
    await nextTask();
    expect(sent).toBe(2);
    expect(cache.getQueryData(["account", "services"])).toBe(2);
    leaveAgain();
    cache.unmount();
    cache.clear();
    focusManager.setFocused(undefined);
  });
});
