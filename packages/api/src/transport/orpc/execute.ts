import { ORPCError } from "@orpc/server";
import { createRequestContext } from "@worship-admin/api/application/context";
import type { RequestContext } from "@worship-admin/api/application/context";
import type { ApplicationFault } from "@worship-admin/api/application/errors";
import type { ApplicationRuntime } from "@worship-admin/api/application/runtime";
import type { RpcContext } from "@worship-admin/api/transport/orpc/context";
import { Cause, Exit } from "effect";
import type { Effect } from "effect";

export const toORPCError = (
  fault: ApplicationFault
): ORPCError<string, unknown> => {
  switch (fault._tag) {
    case "Unauthenticated": {
      return new ORPCError("UNAUTHORIZED", {
        data: { message: fault.message },
      });
    }
    case "Forbidden": {
      return new ORPCError("FORBIDDEN", {
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
  program: Effect.Effect<Value, ApplicationFault, RequestContext>,
  rpcContext: RpcContext,
  signal?: AbortSignal
): Promise<Value> => {
  const baseContext = createRequestContext(rpcContext.request);
  const result = await runtime.execute(program, {
    ...baseContext,
    requestId: rpcContext.requestId,
    signal: signal ?? baseContext.signal,
  });

  if (Exit.isSuccess(result)) {
    return result.value;
  }

  if (Cause.isInterruptedOnly(result.cause)) {
    throw new ORPCError("CLIENT_CLOSED_REQUEST");
  }

  const failures = [...Cause.failures(result.cause)];
  const defects = [...Cause.defects(result.cause)];
  if (failures.length === 1 && defects.length === 0) {
    throw toORPCError(failures[0]);
  }

  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    cause: Cause.squash(result.cause),
  });
};
