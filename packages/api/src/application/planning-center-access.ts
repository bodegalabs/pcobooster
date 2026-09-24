import { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { ExternalServiceFailure } from "@pcobooster/api/application/errors/external-service-failure";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { InvalidInput } from "@pcobooster/api/application/errors/invalid-input";
import { RateLimited } from "@pcobooster/api/application/errors/rate-limited";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import { resolveDemoSession } from "@pcobooster/api/auth/demo-access";
import { requirePlanningCenterAccessToken } from "@pcobooster/api/auth/planning-center-session";
import { isPlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type {
  PlanningCenterError,
  PlanningCenterPersonalAccessToken,
} from "@pcobooster/api/planning-center/core-client";
import {
  createPlanningCenterServices,
  createBasicPlanningCenterServices,
  createReadOnlyPlanningCenterServices,
} from "@pcobooster/api/planning-center/services/factory";
import { Server } from "@pcobooster/api/server";
import type { ServerDependencies } from "@pcobooster/api/server";
import {
  getPresentationSeed,
  isPresentationMode,
} from "@pcobooster/presentation-mode";
import { Context, Effect } from "effect";
import * as HttpClient from "effect/unstable/http/HttpClient";

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
  /** Seeds the fictional names; stable so aliases survive restarts. */
  readonly presentationSeed: string;
}

export class PlanningCenterAccess extends Context.Service<
  PlanningCenterAccess,
  PlanningCenterRequestAccess
>()("@pcobooster/api/PlanningCenterAccess") {}

export interface PlanningCenterAccessDependencies {
  readonly authorize: (request: Request) => Promise<RequestAuthentication>;
  readonly createServices: (
    authentication: RequestAuthentication,
    httpClient: HttpClient.HttpClient
  ) => RequestPlanningCenterServices;
  /** Local presentation mode; demo sessions are always presented. */
  readonly presentationMode: () => boolean;
  readonly presentationSeed: string;
}

export const createPlanningCenterAccessDependencies = (
  server: ServerDependencies
): PlanningCenterAccessDependencies => ({
  authorize: async (request) => {
    const demo = resolveDemoSession(request, server.config.demo);
    if (demo) {
      return { kind: "demo", planningCenter: demo.planningCenter };
    }
    const authenticated = await requirePlanningCenterAccessToken(
      server,
      request
    );
    return {
      kind: "account",
      userId: authenticated.session.user.id,
      accessToken: authenticated.accessToken,
      scopes: authenticated.scopes,
      accountId: authenticated.accountId,
      account: authenticated.account,
    };
  },
  createServices: (authentication, httpClient) => {
    const { fallbackTimeZone, localPlanningCenterToken } = server.config;
    const readCaches = server.planningCenterReadCaches;
    if (authentication.kind === "demo") {
      return createReadOnlyPlanningCenterServices(
        authentication.planningCenter,
        fallbackTimeZone,
        httpClient,
        readCaches
      );
    }
    if (server.config.devAuthBypass) {
      if (localPlanningCenterToken === null) {
        throw new Error(
          "DEV_AUTH_BYPASS needs PLANNING_CENTER_CLIENT and PLANNING_CENTER_PAT"
        );
      }
      return createBasicPlanningCenterServices(
        localPlanningCenterToken,
        fallbackTimeZone,
        httpClient,
        readCaches
      );
    }
    return createPlanningCenterServices(
      authentication.accessToken,
      fallbackTimeZone,
      httpClient,
      readCaches
    );
  },
  presentationMode: () => isPresentationMode(server.config.presentation),
  presentationSeed: getPresentationSeed(server.config.presentation),
});

/** The fault reported for each expected Planning Center failure. */
export const planningCenterFault = (
  error: PlanningCenterError
): ApplicationFault => {
  switch (error._tag) {
    case "PlanningCenterReadOnlyError": {
      return new Forbidden({
        message: "This demo is read-only, so changes aren't saved.",
      });
    }
    case "PlanningCenterApiError": {
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
    case "PlanningCenterRateLimitError": {
      return new RateLimited({
        message:
          "Planning Center rate limit exceeded. Please wait and try again.",
        service: "planning-center",
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    case "PlanningCenterSubrequestLimitError": {
      return new ExternalServiceFailure({
        message:
          "This request needed more Planning Center calls than one request allows.",
        service: "planning-center",
        cause: error,
      });
    }
    case "PlanningCenterNetworkError": {
      return new ExternalServiceFailure({
        message: "Planning Center request failed.",
        service: "planning-center",
        cause: error,
      });
    }
    default: {
      const exhaustiveError: never = error;
      return exhaustiveError;
    }
  }
};

const toFault = (
  error: PlanningCenterError | ApplicationFault
): ApplicationFault =>
  isPlanningCenterError(error) ? planningCenterFault(error) : error;

/** Reports Planning Center failures as application faults; defects stay defects. */
export const withPlanningCenterFaults = <Value, Requirements>(
  effect: Effect.Effect<
    Value,
    PlanningCenterError | ApplicationFault,
    Requirements
  >
): Effect.Effect<Value, ApplicationFault, Requirements> =>
  Effect.mapError(effect, toFault);

/** Classifies an authorization rejection; anything unexpected is a defect. */
export const toApplicationFault = (error: Error): ApplicationFault | null => {
  if (
    error instanceof Unauthenticated ||
    error instanceof Forbidden ||
    error instanceof InvalidInput
  ) {
    return error;
  }
  return isPlanningCenterError(error) ? planningCenterFault(error) : null;
};

const failAuthorization = (
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
  overrides?: PlanningCenterAccessDependencies
): Effect.Effect<
  PlanningCenterRequestAccess,
  ApplicationFault,
  RequestContext | Server | HttpClient.HttpClient
> =>
  Effect.gen(function* resolveAccess() {
    const { request } = yield* RequestContext;
    const dependencies =
      overrides ?? createPlanningCenterAccessDependencies(yield* Server);
    const authentication = yield* Effect.tryPromise({
      try: async () => await dependencies.authorize(request),
      catch: (error) =>
        error instanceof Error
          ? error
          : new Error("Planning Center authorization failed", { cause: error }),
    }).pipe(Effect.catch(failAuthorization));
    const httpClient = yield* HttpClient.HttpClient;
    const services = yield* Effect.sync(() =>
      dependencies.createServices(authentication, httpClient)
    );

    return {
      authentication,
      cacheScope: services.core.getCacheScope(),
      services,
      presentation:
        authentication.kind === "demo" || dependencies.presentationMode(),
      presentationSeed: dependencies.presentationSeed,
    };
  });

export const withPlanningCenterAccess = <Value, Failure, Requirements>(
  program: Effect.Effect<Value, Failure, Requirements | PlanningCenterAccess>,
  dependencies?: PlanningCenterAccessDependencies
): Effect.Effect<
  Value,
  Failure | ApplicationFault,
  | Exclude<Requirements, PlanningCenterAccess>
  | RequestContext
  | Server
  | HttpClient.HttpClient
> =>
  Effect.acquireUseRelease(
    resolvePlanningCenterAccess(dependencies),
    (access) => Effect.provideService(program, PlanningCenterAccess, access),
    // Shared read-cache writes must finish inside the request that started them.
    (access) => access.services.settleReadCaches
  );
