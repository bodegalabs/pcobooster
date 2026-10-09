import { createRequestScheduler } from "@pcobooster/client/request-scheduler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const QUIET_MS = 250;

const deferred = () => Promise.withResolvers<null>();

describe(createRequestScheduler, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("admits calls with the native AbortSignal that lacks throwIfAborted", async () => {
    const controller = new AbortController();
    Object.defineProperty(controller.signal, "throwIfAborted", {
      value: undefined,
    });
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    await expect(
      scheduler.track(
        "interactive",
        async () => await Promise.resolve("loaded"),
        controller.signal
      )
    ).resolves.toBe("loaded");
    controller.abort();
    const call = vi.fn<() => Promise<string>>(
      async () => await Promise.resolve("unexpected")
    );
    await expect(
      scheduler.track("interactive", call, controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(call).not.toHaveBeenCalled();
  });

  it("starts speculative work only after interactive calls have been quiet", async () => {
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    const started: string[] = [];
    const visible = deferred();

    const interactive = scheduler.track("interactive", async () => {
      await visible.promise;
    });
    void scheduler.runSpeculative(async () => {
      started.push("warm-up");
      await Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(QUIET_MS * 4);
    expect(started).toStrictEqual([]);

    visible.resolve(null);
    await interactive;
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(started).toStrictEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toStrictEqual(["warm-up"]);
  });

  it("restarts the quiet period when an interactive call starts during it", async () => {
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    const started: string[] = [];

    void scheduler.runSpeculative(async () => {
      started.push("warm-up");
      await Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(QUIET_MS - 50);
    // The next render's query starts before the warm-up got its turn.
    await scheduler.track("interactive", async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(started).toStrictEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toStrictEqual(["warm-up"]);
  });

  it("runs speculative tasks one at a time, in order", async () => {
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    const started: string[] = [];
    const first = deferred();

    void scheduler.runSpeculative(async () => {
      started.push("first");
      await first.promise;
    });
    void scheduler.runSpeculative(async () => {
      started.push("second");
      await Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(QUIET_MS * 4);
    expect(started).toStrictEqual(["first"]);

    first.resolve(null);
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(started).toStrictEqual(["first", "second"]);
  });

  it("does not hold speculative calls back behind each other's API traffic", async () => {
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    const started: string[] = [];
    const prefetchCall = deferred();

    void scheduler.track("speculative", async () => {
      await prefetchCall.promise;
    });
    void scheduler.runSpeculative(async () => {
      started.push("warm-up");
      await Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(started).toStrictEqual(["warm-up"]);
    prefetchCall.resolve(null);
  });

  it("drops a task whose signal aborts before its turn", async () => {
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    const started: string[] = [];
    const leave = new AbortController();

    const dropped = scheduler.runSpeculative(async () => {
      started.push("left page");
      await Promise.resolve();
    }, leave.signal);
    void scheduler.runSpeculative(async () => {
      started.push("still wanted");
      await Promise.resolve();
    });
    leave.abort();
    await dropped;
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(started).toStrictEqual(["still wanted"]);
  });

  it("keeps the lane moving after a speculative task fails", async () => {
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    const started: string[] = [];

    const failed = scheduler.runSpeculative(async () => {
      started.push("rate limited");
      await Promise.reject(new Error("Planning Center rate limited"));
    });
    void scheduler.runSpeculative(async () => {
      started.push("next");
      await Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(QUIET_MS * 2);
    await expect(failed).resolves.toBeUndefined();
    expect(started).toStrictEqual(["rate limited", "next"]);
  });

  it("passes interactive results and failures through", async () => {
    const scheduler = createRequestScheduler({ quietMs: QUIET_MS });
    const failure = new Error("provider down");

    await expect(
      scheduler.track("interactive", async () => await Promise.resolve(7))
    ).resolves.toBe(7);
    await expect(
      scheduler.track("interactive", async () => await Promise.reject(failure))
    ).rejects.toBe(failure);
  });
});
