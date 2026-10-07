/**
 * Holds speculative work (prefetches, warm-ups) behind the calls the user is waiting on. Plain
 * timers and promises, so web and Expo each make one per app instance (`createRequestScheduler`)
 * and route every product call through its `track`.
 */
import type { RequestPriority } from "@pcobooster/contracts/request-priority";

/**
 * How long the app must have no interactive call in flight before speculative work starts.
 * It covers the gap between one response and the query the next render starts from it (for
 * example candidates, then their details), so a warm-up never slips in between the two.
 */
export const SPECULATIVE_QUIET_MS = 250;

export interface RequestScheduler {
  /**
   * Runs one product call. While any interactive call is in flight, and for `quietMs` after the
   * last one settles, speculative tasks wait.
   */
  track: <Result>(
    priority: RequestPriority,
    call: () => Promise<Result>
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
}: {
  quietMs: number;
}): RequestScheduler => {
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
    call: () => Promise<Result>
  ): Promise<Result> => {
    if (priority === "speculative") {
      return await call();
    }
    interactiveInFlight += 1;
    // The quiet period restarts once this call settles.
    cancelQuietTimer();
    try {
      return await call();
    } finally {
      interactiveInFlight -= 1;
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
