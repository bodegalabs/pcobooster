import type { Effect } from "effect";

/** The success value of an Effect-returning function or mock, for typed fixtures. */
export type SuccessOf<
  Fn extends (...args: never[]) => Effect.Effect<unknown, unknown, unknown>,
> = Effect.Success<ReturnType<Fn>>;
