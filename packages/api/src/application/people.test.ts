import {
  createRequestContext,
  RequestContext,
} from "@pcobooster/api/application/context";
import {
  getPeopleDashboardActivity,
  getPeopleDashboardPerson,
  getPeopleDashboardRoster,
} from "@pcobooster/api/application/people";
import { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import type {
  PlanningCenterRequestAccess,
  RequestAuthentication,
} from "@pcobooster/api/application/planning-center-access";
import {
  createBasicPlanningCenterServices,
  createPlanningCenterReadCaches,
} from "@pcobooster/api/planning-center/services/factory";
import { Server } from "@pcobooster/api/server";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import {
  testFeatureFlags,
  testPlanningCenterToken,
  testServer,
} from "@pcobooster/api/testing/server";
import { Effect, Result } from "effect";
import { describe, expect, it } from "vitest";

const accountAuthentication: RequestAuthentication = {
  kind: "account",
  userId: "user-1",
  accessToken: "access-token",
  scopes: ["people"],
  accountId: "account-1",
  account: { id: "account-1", accountId: "provider-account-1" },
};

const access = (
  authentication: RequestAuthentication
): PlanningCenterRequestAccess => {
  // No request reaches Planning Center: the flag rejects before any read.
  const services = createBasicPlanningCenterServices(
    testPlanningCenterToken,
    "UTC",
    unreachableHttpClient,
    createPlanningCenterReadCaches(null)
  );
  return {
    authentication,
    cacheScope: services.core.getCacheScope(),
    services,
    presentation: false,
    presentationSeed: "seed",
  };
};

const runWithFlagOff = async <Value, Failure>(
  program: Effect.Effect<
    Value,
    Failure,
    PlanningCenterAccess | RequestContext | Server
  >,
  authentication: RequestAuthentication
) => {
  const featureFlags = testFeatureFlags({ people: false });
  const result = await Effect.runPromise(
    Effect.result(
      program.pipe(
        Effect.provideService(PlanningCenterAccess, access(authentication)),
        Effect.provideService(
          RequestContext,
          createRequestContext(
            new Request("https://pcobooster.com/api/rpc/people")
          )
        ),
        Effect.provideService(Server, testServer({ featureFlags }))
      )
    )
  );
  return { result, evaluations: featureFlags.evaluations };
};

const hiddenDashboard = {
  _tag: "Some",
  value: { _tag: "NotFound", resource: "people-dashboard" },
};

const accountEvaluation = [
  {
    flag: "people",
    subject: { userId: "user-1", planningCenterAccountId: "account-1" },
  },
];

describe("People dashboard flag", () => {
  it("hides the dashboard roster when the flag is off for the signed-in account", async () => {
    const { result, evaluations } = await runWithFlagOff(
      getPeopleDashboardRoster(),
      accountAuthentication
    );
    expect(Result.getFailure(result)).toMatchObject(hiddenDashboard);
    expect(evaluations).toStrictEqual(accountEvaluation);
  });

  it("hides dashboard activity batches when the flag is off for the signed-in account", async () => {
    const { result, evaluations } = await runWithFlagOff(
      getPeopleDashboardActivity({ personIds: ["person-1"] }),
      accountAuthentication
    );
    expect(Result.getFailure(result)).toMatchObject(hiddenDashboard);
    expect(evaluations).toStrictEqual(accountEvaluation);
  });

  it("hides a person's page when the flag is off for the signed-in account", async () => {
    const { result, evaluations } = await runWithFlagOff(
      getPeopleDashboardPerson({ personId: "person-1" }),
      accountAuthentication
    );
    expect(Result.getFailure(result)).toMatchObject(hiddenDashboard);
    expect(evaluations).toStrictEqual(accountEvaluation);
  });

  it("evaluates a demo visitor anonymously", async () => {
    const { evaluations } = await runWithFlagOff(getPeopleDashboardRoster(), {
      kind: "demo",
      planningCenter: testPlanningCenterToken,
    });
    expect(evaluations[0]?.subject).toStrictEqual({
      userId: null,
      planningCenterAccountId: null,
    });
  });
});
