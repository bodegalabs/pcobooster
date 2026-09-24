import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import { Forbidden } from "@pcobooster/api/application/errors/forbidden";
import { InvalidInput } from "@pcobooster/api/application/errors/invalid-input";
import { Unauthenticated } from "@pcobooster/api/application/errors/unauthenticated";
import {
  resolvePlanningCenterAccess,
  toApplicationFault,
  tryPlanningCenter,
} from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterAccessDependencies } from "@pcobooster/api/application/planning-center-access";
import { demoSessionToken } from "@pcobooster/api/auth/demo-access";
import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { PlanningCenterNetworkError } from "@pcobooster/api/planning-center/network-error";
import { PlanningCenterReadOnlyError } from "@pcobooster/api/planning-center/read-only-error";
import { createPlanningCenterServices } from "@pcobooster/api/planning-center/services/factory";
import { Server } from "@pcobooster/api/server";
import { testServer, testServerConfig } from "@pcobooster/api/testing/server";
import { DEMO_SESSION_COOKIE } from "@pcobooster/contracts/demo";
import { Cause, Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

const requestFor = (accountId: string): Request =>
  new Request(`https://pcobooster.com/api/rpc/catalog/${accountId}`);

const dependenciesFor = (
  accountId: string
): PlanningCenterAccessDependencies => ({
  authorize: vi
    .fn<PlanningCenterAccessDependencies["authorize"]>()
    .mockResolvedValue({
      kind: "account",
      userId: `user-${accountId}`,
      accessToken: `access-token-${accountId}`,
      scopes: ["services"],
      accountId,
      account: { id: accountId, accountId: `provider-${accountId}` },
    }),
  createServices: (authentication) =>
    createPlanningCenterServices(
      authentication.kind === "account" ? authentication.accessToken : "",
      "America/Los_Angeles"
    ),
  presentationMode: () => false,
  presentationSeed: "test-seed",
  fallbackTimeZone: "America/Los_Angeles",
});

const resolveFor = async (accountId: string) => {
  const request = requestFor(accountId);
  return await Effect.runPromise(
    resolvePlanningCenterAccess(dependenciesFor(accountId)).pipe(
      Effect.provideService(RequestContext, createRequestContext(request)),
      Effect.provideService(Server, testServer())
    )
  );
};

describe("PlanningCenterAccess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates isolated request-owned services for concurrent credentials", async () => {
    const [first, second] = await Promise.all([
      resolveFor("first"),
      resolveFor("second"),
    ]);

    expect({
      first: {
        authentication: first.authentication,
        serviceScope: first.services.core.getCacheScope(),
      },
      second: {
        authentication: second.authentication,
        serviceScope: second.services.core.getCacheScope(),
      },
    }).toMatchObject({
      first: {
        authentication: { accountId: "first" },
        serviceScope: first.cacheScope,
      },
      second: {
        authentication: { accountId: "second" },
        serviceScope: second.cacheScope,
      },
    });
    expect([first.cacheScope, second.cacheScope]).toStrictEqual([
      expect.stringMatching(/^bearer:/u),
      expect.stringMatching(/^bearer:/u),
    ]);
    expect(first.cacheScope).not.toBe(second.cacheScope);
  });

  it("serves a demo session through read-only demo credentials", async () => {
    const config = testServerConfig({
      APP_ENV: "production",
      DEMO_ACCESS_KEY: "demo-access-key-for-access-tests",
      DEMO_PLANNING_CENTER_CLIENT: "demo-app",
      DEMO_PLANNING_CENTER_PAT: "demo-secret",
    });
    const configuration = config.demo;
    if (configuration === null) {
      throw new Error("Expected a demo configuration");
    }
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const request = new Request("https://pcobooster.com/api/rpc/schedule", {
      headers: {
        cookie: `${DEMO_SESSION_COOKIE}=${demoSessionToken(configuration)}`,
      },
    });

    const access = await Effect.runPromise(
      resolvePlanningCenterAccess().pipe(
        Effect.provideService(RequestContext, createRequestContext(request)),
        Effect.provideService(Server, testServer({ config }))
      )
    );

    expect(access.authentication).toStrictEqual({
      kind: "demo",
      planningCenter: { applicationId: "demo-app", secret: "demo-secret" },
    });
    expect(access.cacheScope).toMatch(/^basic:/u);
    expect(access.presentation).toBeTruthy();
    await expect(
      access.services.people.deletePlanPerson("plan-person-1")
    ).rejects.toMatchObject({ name: "PlanningCenterReadOnlyError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps provider rate limits and opaque provider failures to tagged faults", () => {
    const unauthenticated = toApplicationFault(
      new Unauthenticated({ message: "Sign in required" })
    );
    const forbidden = toApplicationFault(
      new Forbidden({ message: "Account access denied" })
    );
    const rateLimited = toApplicationFault(
      new PlanningCenterApiError({
        message: "Too many requests",
        status: 429,
        retryAfterSeconds: 8,
      })
    );
    const unavailable = toApplicationFault(
      new PlanningCenterApiError({
        message: "Upstream diagnostic detail",
        status: 503,
        responseBody: "secret upstream body",
      })
    );

    expect(unauthenticated).toMatchObject({
      _tag: "Unauthenticated",
      message: "Sign in required",
    });
    expect(forbidden).toMatchObject({
      _tag: "Forbidden",
      message: "Account access denied",
    });
    expect(rateLimited).toMatchObject({
      _tag: "RateLimited",
      service: "planning-center",
      retryAfterSeconds: 8,
    });
    expect(unavailable).toMatchObject({
      _tag: "ExternalServiceFailure",
      message: "Planning Center request failed.",
      service: "planning-center",
    });
    expect(unavailable?.message).not.toContain("diagnostic");
  });

  it("maps provider network errors to a tagged fault", () => {
    expect(
      toApplicationFault(
        new PlanningCenterNetworkError({ cause: new TypeError("offline") })
      )
    ).toMatchObject({
      _tag: "ExternalServiceFailure",
      service: "planning-center",
    });
  });

  it("explains a blocked demo write as forbidden", () => {
    expect(
      toApplicationFault(
        new PlanningCenterReadOnlyError({
          method: "POST",
          path: "/services/v2/plans/1/team_members",
        })
      )
    ).toMatchObject({
      _tag: "Forbidden",
      message: "This demo is read-only, so changes aren't saved.",
    });
  });

  it("preserves typed validation failures through Promise adapters", () => {
    const invalid = new InvalidInput({
      message: "Selected position does not belong to selected team",
    });
    expect(toApplicationFault(invalid)).toBe(invalid);
  });

  it("keeps unexpected Promise adapter errors as defects", async () => {
    const unexpected = new TypeError("broken response transform");
    const result = await Effect.runPromiseExit(
      Effect.provideService(
        tryPlanningCenter(async () => {
          await Promise.resolve();
          throw unexpected;
        }),
        RequestContext,
        createRequestContext(requestFor("first"))
      )
    );

    expect(toApplicationFault(unexpected)).toBeNull();
    if (Exit.isSuccess(result)) {
      throw new Error("Expected the adapter error to fail");
    }
    expect(
      result.cause.reasons
        .filter(Cause.isDieReason)
        .map((reason) => reason.defect)
    ).toContain(unexpected);
    expect(
      result.cause.reasons
        .filter(Cause.isFailReason)
        .map((reason) => reason.error)
    ).toStrictEqual([]);
  });
});
