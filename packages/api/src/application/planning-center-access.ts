import { RequestContext } from "@worship-admin/api/application/context";
import type { ApplicationFault } from "@worship-admin/api/application/errors";
import { ExternalServiceFailure } from "@worship-admin/api/application/errors/external-service-failure";
import { Forbidden } from "@worship-admin/api/application/errors/forbidden";
import { InvalidInput } from "@worship-admin/api/application/errors/invalid-input";
import { RateLimited } from "@worship-admin/api/application/errors/rate-limited";
import { Unauthenticated } from "@worship-admin/api/application/errors/unauthenticated";
import { requirePlanningCenterAccessToken } from "@worship-admin/api/auth/planning-center-session";
import { ApiError } from "@worship-admin/api/http/api-error";
import { PlanningCenterApiError } from "@worship-admin/api/planning-center/api-error";
import { createPlanningCenterServices } from "@worship-admin/api/planning-center/services/factory";
import { Context, Effect } from "effect";

export interface RequestAuthentication {
  readonly userId: string;
  readonly accessToken: string;
  readonly scopes: readonly string[];
  readonly accountId: string;
  readonly account: {
    readonly id: string;
    readonly accountId: string;
  };
}
export type RequestPlanningCenterServices = ReturnType<
  typeof createPlanningCenterServices
>;

export interface PlanningCenterRequestAccess {
  readonly authentication: RequestAuthentication;
  readonly cacheScope: string;
  readonly services: RequestPlanningCenterServices;
}

export class PlanningCenterAccess extends Context.Tag(
  "@worship-admin/api/PlanningCenterAccess"
)<PlanningCenterAccess, PlanningCenterRequestAccess>() {}

export interface PlanningCenterAccessDependencies {
  readonly authorize: (request: Request) => Promise<RequestAuthentication>;
  readonly createServices: (
    accessToken: string
  ) => RequestPlanningCenterServices;
}

const defaultDependencies: PlanningCenterAccessDependencies = {
  authorize: async (request) => {
    const authenticated = await requirePlanningCenterAccessToken(request);
    return {
      userId: authenticated.session.user.id,
      accessToken: authenticated.accessToken,
      scopes: authenticated.scopes,
      accountId: authenticated.accountId,
      account: authenticated.account,
    };
  },
  createServices: createPlanningCenterServices,
};

export const toApplicationFault = (error: Error): ApplicationFault => {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return new Unauthenticated({ message: error.message });
    }
    if (error.status === 403) {
      return new Forbidden({ message: error.message });
    }
    if (error.status >= 400 && error.status < 500) {
      return new InvalidInput({ message: error.message });
    }
  }

  if (error instanceof PlanningCenterApiError) {
    if (error.status === 429) {
      return new RateLimited({
        message:
          "Planning Center rate limit exceeded. Please wait and try again.",
        service: "planning-center",
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    return new ExternalServiceFailure({
      message: "Planning Center request failed.",
      service: "planning-center",
      cause: error,
    });
  }

  return new ExternalServiceFailure({
    message: "Planning Center request failed.",
    service: "planning-center",
    cause: error,
  });
};

/**
 * Resolves the Better Auth account and creates clients for this Effect only.
 * Converted procedures never consult AsyncLocalStorage for their credential.
 */
export const resolvePlanningCenterAccess = (
  dependencies: PlanningCenterAccessDependencies = defaultDependencies
): Effect.Effect<
  PlanningCenterRequestAccess,
  ApplicationFault,
  RequestContext
> =>
  Effect.gen(function* resolveAccess() {
    const { request } = yield* RequestContext;
    const authentication = yield* Effect.tryPromise({
      try: async () => await dependencies.authorize(request),
      catch: (error) =>
        toApplicationFault(
          error instanceof Error
            ? error
            : new Error("Planning Center authorization failed")
        ),
    });
    const services = yield* Effect.try({
      try: () => dependencies.createServices(authentication.accessToken),
      catch: (error) =>
        toApplicationFault(
          error instanceof Error
            ? error
            : new Error("Planning Center service initialization failed")
        ),
    });

    return {
      authentication,
      cacheScope: services.core.getCacheScope(),
      services,
    };
  });

export const withPlanningCenterAccess = <Value, Failure, Requirements>(
  program: Effect.Effect<Value, Failure, Requirements | PlanningCenterAccess>,
  dependencies: PlanningCenterAccessDependencies = defaultDependencies
): Effect.Effect<
  Value,
  Failure | ApplicationFault,
  Exclude<Requirements, PlanningCenterAccess> | RequestContext
> =>
  Effect.flatMap(resolvePlanningCenterAccess(dependencies), (access) =>
    Effect.provideService(program, PlanningCenterAccess, access)
  );

export const tryPlanningCenter = <Value>(
  operation: () => Promise<Value>
): Effect.Effect<Value, ApplicationFault> =>
  Effect.tryPromise({
    try: operation,
    catch: (error) =>
      toApplicationFault(
        error instanceof Error
          ? error
          : new Error("Planning Center request failed")
      ),
  });
