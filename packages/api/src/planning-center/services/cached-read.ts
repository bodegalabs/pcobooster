import { isPlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { Cause, Effect, Exit } from "effect";

/** Hands a load's outcome to the cache's Promise waiters. */
const settleLoad = <Value>(
  exit: Exit.Exit<Value, PlanningCenterError>
): Value => {
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  const failure = exit.cause.reasons.find(Cause.isFailReason);
  if (failure !== undefined) {
    throw failure.error;
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    throw new DOMException("The operation was aborted", "AbortError");
  }
  const defect = Cause.squash(exit.cause);
  throw defect instanceof Error
    ? defect
    : new Error("Planning Center read failed", { cause: defect });
};

/**
 * Reads through a shared cache; `load` is only built on a miss. Each caller
 * waits on its own fiber, so interrupting one caller leaves the load running
 * for the others; the load is interrupted, and nothing is cached, once no
 * callers remain.
 */
export const cachedRead = <Value>(
  cache: PlanningCenterReadCache<Value>,
  key: string,
  ttlMs: number,
  load: () => Effect.Effect<Value, PlanningCenterError>
): Effect.Effect<Value, PlanningCenterError> =>
  Effect.gen(function* readThroughCache() {
    const runLoad = Effect.runPromiseExitWith(yield* Effect.context());
    return yield* Effect.tryPromise(
      async (signal) =>
        await cache.get(
          key,
          ttlMs,
          async (loadSignal) =>
            settleLoad(await runLoad(load(), { signal: loadSignal })),
          signal
        )
    ).pipe(
      Effect.catch(({ cause }) =>
        isPlanningCenterError(cause) ? Effect.fail(cause) : Effect.die(cause)
      )
    );
  });
