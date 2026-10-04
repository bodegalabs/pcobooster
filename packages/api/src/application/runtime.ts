import { RequestContext } from "@pcobooster/api/application/context";
import type { RequestContextValue } from "@pcobooster/api/application/context";
import { Effect } from "effect";
import type { Context, Exit } from "effect";

export interface ApplicationRuntime<Services> {
  readonly execute: <Value, Failure>(
    program: Effect.Effect<Value, Failure, Services | RequestContext>,
    context: RequestContextValue,
    executionSignal?: AbortSignal
  ) => Promise<Exit.Exit<Value, Failure>>;
}

/**
 * Runs one request's programs with that request's services. In the Worker these come from
 * Alchemy's request fiber, so programs share its HTTP client, logger, and tracer: their spans
 * nest in the invocation's Workers trace beside the fetch, D1, and KV calls Cloudflare records.
 */
export const applicationRuntimeFor = <Services>(
  services: Context.Context<Services>
): ApplicationRuntime<Services> => ({
  execute: async (program, context, executionSignal = context.signal) =>
    await Effect.runPromiseExitWith(services)(
      Effect.provideService(program, RequestContext, context),
      { signal: executionSignal }
    ),
});
