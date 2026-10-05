import { createRequestContext } from "@pcobooster/api/application/context";
import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { requestErrorSchema } from "@pcobooster/api/modules/analytics/posthog-exception";
import { PlanningCenterAccounting } from "@pcobooster/api/planning-center/accounting";
import { Server } from "@pcobooster/api/server";
import type { RpcContext } from "@pcobooster/api/transport/rpc/context";
import { RpcError } from "@pcobooster/contracts/errors";
import { Cause, Effect, Exit } from "effect";
import type { HttpClient } from "effect/http/HttpClient";

export interface ExecuteApplicationEffectOptions {
  /**
   * Reads should stop as soon as their caller disconnects. Scheduling writes
   * deliberately opt out: their application program observes the request
   * signal before a write begins, then waits for an in-flight provider write
   * so its audit record reports the real outcome.
   */
  readonly interruptOnAbort?: boolean;
}

export const toRpcError = (fault: ApplicationFault): RpcError => {
  switch (fault._tag) {
    case "AlreadyScheduled": {
      return new RpcError({
        code: "ALREADY_SCHEDULED",
        status: 409,
        message: fault.message,
        data: { message: fault.message, details: fault.details },
      });
    }
    case "PositionMismatch": {
      return new RpcError({
        code: "POSITION_MISMATCH",
        status: 409,
        message: fault.message,
        data: { message: fault.message, details: fault.details },
      });
    }
    case "Unauthenticated": {
      return new RpcError({
        code: "UNAUTHORIZED",
        status: 401,
        message: fault.message,
        data: { message: fault.message },
      });
    }
    case "Forbidden": {
      return new RpcError({
        code: "FORBIDDEN",
        status: 403,
        message: fault.message,
        data: { message: fault.message },
      });
    }
    case "InvalidInput": {
      return new RpcError({
        code: "BAD_REQUEST",
        status: 400,
        message: fault.message,
        data: { message: fault.message },
      });
    }
    case "NotFound": {
      return new RpcError({
        code: "NOT_FOUND",
        status: 404,
        message: fault.message,
        data: { message: fault.message, resource: fault.resource },
      });
    }
    case "Conflict": {
      return new RpcError({
        code: "CONFLICT",
        status: 409,
        message: fault.message,
        data: { message: fault.message, reason: fault.reason },
      });
    }
    case "RateLimited": {
      return new RpcError({
        code: "TOO_MANY_REQUESTS",
        status: 429,
        message: fault.message,
        retryAfterSeconds: fault.retryAfterSeconds,
        data: {
          message: fault.message,
          service: fault.service,
          retryAfterSeconds: fault.retryAfterSeconds,
        },
      });
    }
    case "ExternalServiceFailure": {
      return new RpcError({
        code: "BAD_GATEWAY",
        status: 502,
        message: fault.message,
        data: { message: fault.message, service: fault.service },
      });
    }
    case "PersistenceFailure": {
      return new RpcError({
        code: "INTERNAL_SERVER_ERROR",
        status: 500,
        message: "Internal server error",
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
  program: Effect.Effect<
    Value,
    ApplicationFault,
    RequestContext | Server | HttpClient
  >,
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
  const withServer = Effect.provideService(program, Server, rpcContext.server);
  const { planningCenterAccounting, procedure, requestId } = rpcContext;
  const accounted =
    planningCenterAccounting === undefined
      ? withServer
      : Effect.provideService(
          withServer,
          PlanningCenterAccounting,
          planningCenterAccounting
        );
  const result = await rpcContext.runtime.execute(
    accounted.pipe(
      Effect.withSpan(procedure ?? "rpc", {
        attributes: { "rpc.procedure": procedure, "request.id": requestId },
      }),
      Effect.annotateLogs({ procedure, requestId })
    ),
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
    throw new RpcError({
      code: "CLIENT_CLOSED_REQUEST",
      status: 499,
      message: "Request cancelled",
      data: { message: "Request cancelled" },
    });
  }

  const failures = result.cause.reasons.flatMap((reason) =>
    Cause.isFailReason(reason) ? [reason.error] : []
  );
  const defects = result.cause.reasons.flatMap((reason) =>
    Cause.isDieReason(reason) ? [reason.defect] : []
  );
  if (failures.length === 1 && defects.length === 0) {
    const [fault] = failures;
    const error = toRpcError(fault);
    if (error.status >= 500) {
      await rpcContext.onUnexpectedError?.(
        fault._tag === "ExternalServiceFailure" ||
          fault._tag === "PersistenceFailure"
          ? requestErrorSchema.parse(fault.cause)
          : error,
        rpcContext.procedure
      );
    }
    throw error;
  }

  await rpcContext.onUnexpectedError?.(
    requestErrorSchema.parse(Cause.squash(result.cause)),
    rpcContext.procedure
  );
  throw new RpcError({
    code: "INTERNAL_SERVER_ERROR",
    status: 500,
    message: "Internal server error",
    data: { message: "Internal server error" },
  });
};
