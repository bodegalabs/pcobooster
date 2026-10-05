import { setTimeout as delay } from "node:timers/promises";

import { QueryClient, QueryObserver, hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { pauseInactiveQuery } from "./query-lifecycle";

const fixture = () => {
  const client = new QueryClient();
  const key = ["native", "progressive"];
  const aborted = Promise.withResolvers<null>();
  const options = {
    queryKey: key,
    retry: false,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const pending = Promise.withResolvers<number[]>();
      signal.addEventListener(
        "abort",
        () => {
          aborted.resolve(null);
          const error = new Error("Cancelled");
          error.name = "AbortError";
          pending.reject(error);
        },
        { once: true }
      );
      return await pending.promise;
    },
  };
  return { client, key, aborted, options };
};

describe("Native screen query ownership", () => {
  it("waits until enabled observer updates have committed before aborting a hidden screen", async () => {
    const { client, key, aborted, options } = fixture();
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {
      /* Observe the visible screen. */
    });
    const stop = pauseInactiveQuery(client, hashKey(key));
    observer.setOptions({ ...options, enabled: false });
    await aborted.promise;
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    stop();
    unsubscribe();
    client.clear();
  });

  it("does not cancel a shared read with a surviving visible observer", async () => {
    const { client, key, options } = fixture();
    const hidden = new QueryObserver(client, options);
    const visible = new QueryObserver(client, options);
    const unsubscribeHidden = hidden.subscribe(() => {
      /* Hidden screen transitions away. */
    });
    const unsubscribeVisible = visible.subscribe(() => {
      /* Another screen still needs the same query. */
    });
    const stop = pauseInactiveQuery(client, hashKey(key));
    hidden.setOptions({ ...options, enabled: false });
    await delay(10);
    expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
    stop();
    unsubscribeHidden();
    unsubscribeVisible();
    client.clear();
  });
});
