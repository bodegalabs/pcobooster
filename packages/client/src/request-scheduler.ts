/**
 * Holds speculative work (prefetches, warm-ups) behind the calls the user is waiting on. Plain
 * timers and promises, so web and Expo each make one per app instance (`createRequestScheduler`)
 * and route every product call through its `track`.
 */
import type { RequestPriority } from "@pcobooster/contracts/request-priority";

import { throwIfAborted } from "./abort-signal";

/**
 * How long the app must have no interactive call in flight before speculative work starts.
 * It covers the gap between one response and the query the next render starts from it (for
 * example candidates, then their details), so a warm-up never slips in between the two.
 */
export const SPECULATIVE_QUIET_MS = 250;

export interface RequestScheduler {
  /**
   * Runs one product call. While any interactive call is in flight, and for `quietMs` after the
   * last one settles, speculative tasks wait. With a configured concurrency cap, all calls
   * share its admission slots; queued interactive work goes first. An aborted queued call
   * rejects without invoking its callback.
   */
  track: <Result>(
    priority: RequestPriority,
    call: () => Promise<Result>,
    signal?: AbortSignal
  ) => Promise<Result>;
  /**
   * Queues speculative work (a prefetch or warm-up) behind what the user is waiting on. Tasks
   * run one at a time, in order, each only once interactive calls have been quiet for
   * `quietMs`. A task whose signal aborts before it starts is dropped. Resolves when the task
   * settles or is dropped; failures are swallowed, since the destination query owns visible
   * errors.
   */
  runSpeculative: (
    task: () => Promise<void>,
    signal?: AbortSignal
  ) => Promise<void>;
}

interface QueuedTask {
  task: () => Promise<void>;
  signal: AbortSignal | undefined;
  settle: () => void;
}

const runTask = async (entry: QueuedTask) => {
  try {
    await entry.task();
  } catch {
    // Speculative work is best effort; the destination query surfaces its own errors.
  } finally {
    entry.settle();
  }
};

export const createRequestScheduler = ({
  quietMs,
  maxConcurrentRequests = Number.POSITIVE_INFINITY,
}: {
  quietMs: number;
  /** Mobile caps all product calls at two; other clients retain their existing admission. */
  maxConcurrentRequests?: number;
}): RequestScheduler => {
  if (!(maxConcurrentRequests >= 1)) {
    throw new Error("Request concurrency must be at least one");
  }
  let activeCalls = 0;
  const admissions: { priority: RequestPriority; start: () => void }[] = [];
  const drainAdmissions = () => {
    while (activeCalls < maxConcurrentRequests && admissions.length > 0) {
      const interactive = admissions.findIndex(
        (entry) => entry.priority === "interactive"
      );
      const [next] = admissions.splice(Math.max(0, interactive), 1);
      if (next !== undefined) {
        activeCalls += 1;
        next.start();
      }
    }
  };
  const admit = async (priority: RequestPriority, signal?: AbortSignal) => {
    throwIfAborted(signal);
    if (activeCalls < maxConcurrentRequests && admissions.length === 0) {
      activeCalls += 1;
      return;
    }
    const ready = Promise.withResolvers<null>();
    const entry = {
      priority,
      start: () => {
        ready.resolve(null);
      },
    };
    const abort = () => {
      const index = admissions.indexOf(entry);
      if (index !== -1) {
        admissions.splice(index, 1);
        ready.reject(
          signal?.reason ?? new DOMException("Aborted", "AbortError")
        );
      }
    };
    admissions.push(entry);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      await ready.promise;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  };
  const queue: QueuedTask[] = [];
  let interactiveInFlight = 0;
  let running = false;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelQuietTimer = () => {
    if (quietTimer !== undefined) {
      clearTimeout(quietTimer);
      quietTimer = undefined;
    }
  };

  const dropAbortedHead = () => {
    while (queue[0]?.signal?.aborted === true) {
      queue.shift()?.settle();
    }
  };

  const pump = () => {
    dropAbortedHead();
    if (
      running ||
      quietTimer !== undefined ||
      interactiveInFlight > 0 ||
      queue.length === 0
    ) {
      return;
    }
    // An interactive call that starts meanwhile cancels this timer (see `track`).
    quietTimer = setTimeout(() => {
      quietTimer = undefined;
      dropAbortedHead();
      const next = queue.shift();
      if (next === undefined) {
        return;
      }
      running = true;
      void (async () => {
        await runTask(next);
        running = false;
        pump();
      })();
    }, quietMs);
  };

  const track = async <Result>(
    priority: RequestPriority,
    call: () => Promise<Result>,
    signal?: AbortSignal
  ): Promise<Result> => {
    if (priority === "interactive") {
      interactiveInFlight += 1;
      cancelQuietTimer();
    }
    let admitted = false;
    try {
      await admit(priority, signal);
      admitted = true;
      throwIfAborted(signal);
      return await call();
    } finally {
      if (admitted) {
        activeCalls -= 1;
      }
      if (priority === "interactive") {
        interactiveInFlight -= 1;
      }
      drainAdmissions();
      pump();
    }
  };

  const runSpeculative = async (
    task: () => Promise<void>,
    signal?: AbortSignal
  ): Promise<void> => {
    if (signal?.aborted === true) {
      return;
    }
    const { promise, resolve } = Promise.withResolvers<null>();
    const entry: QueuedTask = {
      task,
      signal,
      settle: () => {
        resolve(null);
      },
    };
    queue.push(entry);
    signal?.addEventListener(
      "abort",
      () => {
        const index = queue.indexOf(entry);
        if (index !== -1) {
          queue.splice(index, 1);
          entry.settle();
        }
      },
      { once: true }
    );
    pump();
    await promise;
  };

  return { track, runSpeculative };
};
