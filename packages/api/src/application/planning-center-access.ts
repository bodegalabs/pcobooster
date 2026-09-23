import { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { ExternalServiceFailure } from "@pcobooster/api/application/errors/external-service-failure";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { InvalidInput } from "@pcobooster/api/application/errors/invalid-input";
import { RateLimited } from "@pcobooster/api/application/errors/rate-limited";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import {
  readDemoConfiguration,
  resolveDemoSession,
} from "@pcobooster/api/auth/demo-access";
import { isDevAuthBypassEnabled } from "@pcobooster/api/auth/dev-bypass";
import { requirePlanningCenterAccessToken } from "@pcobooster/api/auth/planning-center-session";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import type { PlanningCenterPersonalAccessToken } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterNetworkError } from "@pcobooster/api/planning-center/network-error";
import { PlanningCenterReadOnlyError } from "@pcobooster/api/planning-center/read-only-error";
import {
  createPlanningCenterServices,
  createBasicPlanningCenterServices,
  createReadOnlyPlanningCenterServices,
} from "@pcobooster/api/planning-center/services/factory";
import { isPresentationMode } from "@pcobooster/presentation-mode";
import { Context, Effect } from "effect";

/** A signed-in user acting through their linked Planning Center account. */
export interface AccountAuthentication {
  readonly kind: "account";
  readonly userId: string;
  readonly accessToken: string;
  readonly scopes: readonly string[];
  readonly accountId: string;
  readonly account: {
    readonly id: string;
    readonly accountId: string;
  };
}

/** An anonymous visitor reading the demo organization. */
export interface DemoAuthentication {
  readonly kind: "demo";
  readonly planningCenter: PlanningCenterPersonalAccessToken;
}

export type RequestAuthentication = AccountAuthentication | DemoAuthentication;

export type RequestPlanningCenterServices = ReturnType<
  typeof createPlanningCenterServices
>;

export interface PlanningCenterRequestAccess {
  readonly authentication: RequestAuthentication;
  readonly cacheScope: string;
  readonly services: RequestPlanningCenterServices;
  /** Replace people's personal details with stable fictional ones. */
  readonly presentation: boolean;
}

export class PlanningCenterAccess extends Context.Service<
  PlanningCenterAccess,
  PlanningCenterRequestAccess
>()("@pcobooster/api/PlanningCenterAccess") {}

export interface PlanningCenterAccessDependencies {
  readonly authorize: (request: Request) => Promise<RequestAuthentication>;
  readonly createServices: (
    authentication: RequestAuthentication
  ) => RequestPlanningCenterServices;
  /** Local presentation mode; demo sessions are always presented. */
  readonly presentationMode: () => boolean;
}

const defaultDependencies: PlanningCenterAccessDependencies = {
  authorize: async (request) => {
    const demo = resolveDemoSession(request, readDemoConfiguration());
    if (demo) {
      return { kind: "demo", planningCenter: demo.planningCenter };
    }
    const authenticated = await requirePlanningCenterAccessToken(request);
    return {
      kind: "account",
      userId: authenticated.session.user.id,
      accessToken: authenticated.accessToken,
      scopes: authenticated.scopes,
      accountId: authenticated.accountId,
      account: authenticated.account,
    };
  },
  createServices: (authentication) => {
    if (authentication.kind === "demo") {
      return createReadOnlyPlanningCenterServices(
        authentication.planningCenter
      );
    }
    return isDevAuthBypassEnabled()
      ? createBasicPlanningCenterServices()
      : createPlanningCenterServices(authentication.accessToken);
  },
  presentationMode: isPresentationMode,
};

export const toApplicationFault = (error: Error): ApplicationFault | null => {
  if (
    error instanceof Unauthenticated ||
    error instanceof Forbidden ||
    error instanceof InvalidInput
  ) {
    return error;
  }

  if (error instanceof PlanningCenterReadOnlyError) {
    return new Forbidden({
      message: "This demo is read-only, so changes aren't saved.",
    });
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

  if (error instanceof PlanningCenterNetworkError) {
    return new ExternalServiceFailure({
      message: "Planning Center request failed.",
      service: "planning-center",
      cause: error,
    });
  }

  return null;
};

export const failPlanningCenter = (
  error: Error
): Effect.Effect<never, ApplicationFault> => {
  const fault = toApplicationFault(error);
  return fault === null ? Effect.die(error) : Effect.fail(fault);
};

/**
 * Resolves the demo session or Better Auth account and creates clients for
 * this Effect only. Each client retains its credential for its entire lifetime.
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
        error instanceof Error
          ? error
          : new Error("Planning Center authorization failed", { cause: error }),
    }).pipe(Effect.catch(failPlanningCenter));
    const services = yield* Effect.sync(() =>
      dependencies.createServices(authentication)
    );

    return {
      authentication,
      cacheScope: services.core.getCacheScope(),
      services,
      presentation:
        authentication.kind === "demo" || dependencies.presentationMode(),
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
  operation: (signal: AbortSignal) => Promise<Value>
): Effect.Effect<Value, ApplicationFault, RequestContext> =>
  Effect.gen(function* tryOperation() {
    const { signal: requestSignal } = yield* RequestContext;
    return yield* Effect.tryPromise({
      try: async (fiberSignal) =>
        await operation(AbortSignal.any([requestSignal, fiberSignal])),
      catch: (error) =>
        error instanceof Error
          ? error
          : new Error("Planning Center operation failed", { cause: error }),
    }).pipe(Effect.catch(failPlanningCenter));
  });
