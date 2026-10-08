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
  self: Effect.Effect<A, E, R>,
  options: { readonly ttlMs?: number; readonly now?: () => number } = {}
): Effect.Effect<Effect.Effect<A, E, R>> =>
  Effect.sync(() => {
    const ttlMs = options.ttlMs ?? Number.POSITIVE_INFINITY;
    const now = options.now ?? Date.now;
    if (ttlMs <= 0 || Number.isNaN(ttlMs)) {
      throw new Error("Cache lifetime must be positive");
    }
    let pending:
      | { readonly promise: Promise<Exit.Exit<A, E>>; expiresAt: number }
      | undefined;
    return Effect.gen(function* awaitShared() {
      const started =
        pending !== undefined && now() < pending.expiresAt
          ? pending
          : {
              promise: Effect.runPromiseExitWith(yield* Effect.context<R>())(
                self
              ),
              expiresAt: Number.POSITIVE_INFINITY,
            };
      pending = started;
      const exit = yield* Effect.promise(async () => await started.promise);
      if (Exit.isFailure(exit) && pending === started) {
        pending = undefined;
      } else if (
        Exit.isSuccess(exit) &&
        started.expiresAt === Number.POSITIVE_INFINITY
      ) {
        started.expiresAt = now() + ttlMs;
      }
      return yield* exit;
    });
  });

/** Share initialization for one resolved configuration; a changed configuration starts a new run. */
export const cachedAcrossRequestsBy = <Key, A, E, R>(
  input: Effect.Effect<Key, E, R>,
  build: (key: Key) => Effect.Effect<A, E, R>,
  equal: (left: Key, right: Key) => boolean
): Effect.Effect<Effect.Effect<A, E, R>> =>
  Effect.sync(() => {
    let current:
      | { readonly key: Key; readonly promise: Promise<Exit.Exit<A, E>> }
      | undefined;
    return Effect.gen(function* awaitConfiguration() {
      const key = yield* input;
      const started =
        current !== undefined && equal(key, current.key)
          ? current
          : {
              key,
              promise: Effect.runPromiseExitWith(yield* Effect.context<R>())(
                build(key)
              ),
            };
      current = started;
      const exit = yield* Effect.promise(async () => await started.promise);
      if (Exit.isFailure(exit) && current === started) {
        current = undefined;
      }
      return yield* exit;
    });
  });
