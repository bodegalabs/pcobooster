import { Effect } from "effect";

/**
 * A write whose prepare step may stop when the caller disconnects (nothing is written yet) and
 * whose commit always finishes, so the procedure reports what the provider really did.
 * ProcedureScope already runs `write` procedures uninterruptibly; this reopens interruption for
 * the prepare step only.
 */
export const preparedWrite = <
  Prepared,
  Value,
  PrepareFailure,
  CommitFailure,
  PrepareServices,
  CommitServices,
>(
  prepare: Effect.Effect<Prepared, PrepareFailure, PrepareServices>,
  commit: (
    prepared: Prepared
  ) => Effect.Effect<Value, CommitFailure, CommitServices>
): Effect.Effect<
  Value,
  PrepareFailure | CommitFailure,
  PrepareServices | CommitServices
> => Effect.interruptible(prepare).pipe(Effect.flatMap(commit));
