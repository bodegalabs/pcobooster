import { ORPCError } from "@orpc/server";
import { createRequestContext } from "@pcobooster/api/application/context";
import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import type { ApplicationRuntime } from "@pcobooster/api/application/runtime";
import { Server } from "@pcobooster/api/server";
import type { RpcContext } from "@pcobooster/api/transport/orpc/context";
import { Cause, Effect, Exit } from "effect";

export interface ExecuteApplicationEffectOptions {
  /**
   * Reads should stop as soon as their caller disconnects. Scheduling writes
   * deliberately opt out: their application program observes the request
   * signal before a write begins, then waits for an in-flight provider write
   * so its audit record reports the real outcome.
   */
  readonly interruptOnAbort?: boolean;
}

export const toORPCError = (
  fault: ApplicationFault
): ORPCError<string, unknown> => {
  switch (fault._tag) {
    case "AlreadyScheduled": {
      return new ORPCError("ALREADY_SCHEDULED", {
        status: 409,
        data: { message: fault.message, details: fault.details },
      });
    }
    case "PositionMismatch": {
      return new ORPCError("POSITION_MISMATCH", {
        status: 409,
        data: { message: fault.message, details: fault.details },
      });
    }
    case "Unauthenticated": {
      return new ORPCError("UNAUTHORIZED", {
        data: { message: fault.message },
      });
    }
    case "Forbidden": {
      // Forbidden messages are written for people, such as the read-only
      // demo notice, so clients that toast `error.message` show them as is.
      return new ORPCError("FORBIDDEN", {
        message: fault.message,
        data: { message: fault.message },
      });
    }
    case "InvalidInput": {
      return new ORPCError("BAD_REQUEST", {
        data: { message: fault.message },
      });
    }
    case "NotFound": {
      return new ORPCError("NOT_FOUND", {
        data: { message: fault.message, resource: fault.resource },
      });
    }
    case "Conflict": {
      return new ORPCError("CONFLICT", {
        data: { message: fault.message, reason: fault.reason },
      });
    }
    case "RateLimited": {
      return new ORPCError("TOO_MANY_REQUESTS", {
        data: {
          message: fault.message,
          service: fault.service,
          retryAfterSeconds: fault.retryAfterSeconds,
        },
      });
    }
    case "ExternalServiceFailure": {
      return new ORPCError("BAD_GATEWAY", {
        cause: fault.cause,
        data: { message: fault.message, service: fault.service },
      });
    }
    case "PersistenceFailure": {
      return new ORPCError("INTERNAL_SERVER_ERROR", {
        cause: fault.cause,
        data: { message: "Internal server error" },
      });
    }
    default: {
      const exhaustiveFault: never = fault;
      return exhaustiveFault;
    }
  }
};

export const executeApplicationEffect = async <Value>(
  runtime: ApplicationRuntime<never>,
  program: Effect.Effect<Value, ApplicationFault, RequestContext | Server>,
  rpcContext: RpcContext,
  signal?: AbortSignal,
  options: ExecuteApplicationEffectOptions = {}
): Promise<Value> => {
  const baseContext = createRequestContext(rpcContext.request);
  const requestSignal = signal ?? baseContext.signal;
  const executionSignal =
    options.interruptOnAbort === false
      ? new AbortController().signal
      : requestSignal;
  const result = await runtime.execute(
    Effect.provideService(program, Server, rpcContext.server),
    {
      ...baseContext,
      requestId: rpcContext.requestId,
      signal: requestSignal,
    },
    executionSignal
  );

  if (Exit.isSuccess(result)) {
    return result.value;
  }

  if (Cause.hasInterruptsOnly(result.cause)) {
    throw new ORPCError("CLIENT_CLOSED_REQUEST");
  }

  const failures = result.cause.reasons.flatMap((reason) =>
    Cause.isFailReason(reason) ? [reason.error] : []
  );
  const defects = result.cause.reasons.flatMap((reason) =>
    Cause.isDieReason(reason) ? [reason.defect] : []
  );
  if (failures.length === 1 && defects.length === 0) {
    throw toORPCError(failures[0]);
  }

  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    cause: Cause.squash(result.cause),
  });
};
