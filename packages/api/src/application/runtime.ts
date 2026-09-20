import { RequestContext } from "@worship-admin/api/application/context";
import type { RequestContextValue } from "@worship-admin/api/application/context";
import { Effect, ManagedRuntime } from "effect";
import type { Exit, Layer } from "effect";

export interface ApplicationRuntime<Services, InitializationError = never> {
  readonly execute: <Value, Failure>(
    program: Effect.Effect<Value, Failure, Services | RequestContext>,
    context: RequestContextValue
  ) => Promise<Exit.Exit<Value, Failure | InitializationError>>;
  readonly dispose: () => Promise<void>;
}

/** Shared layers own process resources; each execution supplies its own request. */
export const createApplicationRuntime = <Services, InitializationError>(
  layer: Layer.Layer<Services, InitializationError>
): ApplicationRuntime<Services, InitializationError> => {
  const runtime = ManagedRuntime.make(layer);

  return {
    execute: async (program, context) =>
      await runtime.runPromiseExit(
        Effect.provideService(program, RequestContext, context),
        { signal: context.signal }
      ),
    dispose: async () => {
      await runtime.dispose();
    },
  };
};
