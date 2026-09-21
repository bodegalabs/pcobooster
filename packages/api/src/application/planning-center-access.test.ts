import {
  createRequestContext,
  RequestContext,
} from "@worship-admin/api/application/context";
import { Forbidden } from "@worship-admin/api/application/errors/forbidden";
import { InvalidInput } from "@worship-admin/api/application/errors/invalid-input";
import { Unauthenticated } from "@worship-admin/api/application/errors/unauthenticated";
import {
  resolvePlanningCenterAccess,
  toApplicationFault,
} from "@worship-admin/api/application/planning-center-access";
import type { PlanningCenterAccessDependencies } from "@worship-admin/api/application/planning-center-access";
import { PlanningCenterApiError } from "@worship-admin/api/planning-center/api-error";
import { createPlanningCenterServices } from "@worship-admin/api/planning-center/services/factory";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const requestFor = (accountId: string): Request =>
  new Request(`https://worshipadmin.com/api/rpc/catalog/${accountId}`);

const dependenciesFor = (
  accountId: string
): PlanningCenterAccessDependencies => ({
  authorize: vi
    .fn<PlanningCenterAccessDependencies["authorize"]>()
    .mockResolvedValue({
      userId: `user-${accountId}`,
      accessToken: `access-token-${accountId}`,
      scopes: ["services"],
      accountId,
      account: { id: accountId, accountId: `provider-${accountId}` },
    }),
  createServices: createPlanningCenterServices,
});

const resolveFor = async (accountId: string) => {
  const request = requestFor(accountId);
  return await Effect.runPromise(
    Effect.provideService(
      resolvePlanningCenterAccess(dependenciesFor(accountId)),
      RequestContext,
      createRequestContext(request)
    )
  );
};

describe("PlanningCenterAccess", () => {
  it("creates isolated request-owned services for concurrent credentials", async () => {
    const [first, second] = await Promise.all([
      resolveFor("first"),
      resolveFor("second"),
    ]);

    expect({
      first: {
        accountId: first.authentication.accountId,
        serviceScope: first.services.core.getCacheScope(),
      },
      second: {
        accountId: second.authentication.accountId,
        serviceScope: second.services.core.getCacheScope(),
      },
    }).toMatchObject({
      first: { accountId: "first", serviceScope: first.cacheScope },
      second: { accountId: "second", serviceScope: second.cacheScope },
    });
    expect([first.cacheScope, second.cacheScope]).toStrictEqual([
      expect.stringMatching(/^bearer:/u),
      expect.stringMatching(/^bearer:/u),
    ]);
    expect(first.cacheScope).not.toBe(second.cacheScope);
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
    expect(unavailable.message).not.toContain("diagnostic");
  });

  it("preserves typed validation failures through Promise adapters", () => {
    const invalid = new InvalidInput({
      message: "Selected position does not belong to selected team",
    });
    expect(toApplicationFault(invalid)).toBe(invalid);
  });
});
