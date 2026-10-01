import { Effect, Exit } from "effect";

/**
 * `Effect.cached` for work an isolate shares across requests. It runs `self` once, with the
 * first caller's services, and gives every caller the same exit, so typed failures stay typed.
 *
 * `Effect.cached` cannot do this in workerd. Its latch resumes waiting fibers from the fiber
 * that finished, so they continue inside that request's I/O context and cannot read their own
 * request bodies (or they hang). Here each caller awaits a native Promise instead, and workerd
 * delivers its settlement into the caller's own context.
 *
 * The shared run is its own fiber: one caller's interruption does not stop it for the rest. A
 * failure is forgotten, so the next caller retries instead of the isolate serving the same
 * failure until it is recycled.
 */
export const cachedAcrossRequests = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<Effect.Effect<A, E, R>> =>
  Effect.sync(() => {
    let pending: Promise<Exit.Exit<A, E>> | undefined;
    return Effect.gen(function* awaitShared() {
      const started =
        pending ?? Effect.runPromiseExitWith(yield* Effect.context<R>())(self);
      pending = started;
      const exit = yield* Effect.promise(async () => await started);
      if (Exit.isFailure(exit) && pending === started) {
        pending = undefined;
      }
      return yield* exit;
    });
  });
