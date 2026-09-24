import { Cause, Effect } from "effect";

/**
 * Falls back after any failure or defect, as optional Planning Center reads
 * always have, while cancellation still stops the caller.
 */
export const recoverUnlessInterrupted =
  <Fallback>(fallback: () => Fallback) =>
  <Value, Failure, Requirements>(
    self: Effect.Effect<Value, Failure, Requirements>
  ): Effect.Effect<Value | Fallback, never, Requirements> =>
    Effect.catchCause(self, (cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.sync(fallback)
    );
