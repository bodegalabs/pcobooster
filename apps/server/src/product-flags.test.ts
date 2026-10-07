import type {
  PlanningCenterAccessDependencies,
  RequestAuthentication,
} from "@pcobooster/api/application/planning-center-access";
import {
  createBasicPlanningCenterServices,
  createPlanningCenterReadCaches,
} from "@pcobooster/api/planning-center/services/factory";
import {
  testFeatureFlags,
  testPlanningCenterToken,
  testServer,
} from "@pcobooster/api/testing/server";
import type { ProductClient } from "@pcobooster/client/product-client";
import { NotFound } from "@pcobooster/contracts/faults/not-found";
import type { FeatureFlagName } from "@pcobooster/contracts/features";
import { describe, expect, it } from "vitest";

import { serveHttpForTest } from "./test-http";

const accountAuthentication: RequestAuthentication = {
  kind: "account",
  userId: "user-1",
  accessToken: "access-token",
  scopes: ["people"],
  accountId: "account-1",
  account: { id: "account-1", accountId: "provider-account-1" },
};

const demoAuthentication: RequestAuthentication = {
  kind: "demo",
  planningCenter: testPlanningCenterToken,
};

/** Access as `authentication`; no request reaches Planning Center (the router's client fails). */
const accessAs = (
  authentication: RequestAuthentication
): PlanningCenterAccessDependencies => ({
  authorize: async () => await Promise.resolve(authentication),
  createServices: (_authentication, httpClient) =>
    createBasicPlanningCenterServices(
      testPlanningCenterToken,
      "UTC",
      httpClient,
      createPlanningCenterReadCaches(null)
    ),
  presentationMode: () => false,
  presentationSeed: "seed",
});

const flagOff = (
  flag: FeatureFlagName,
  authentication: RequestAuthentication
) => {
  const featureFlags = testFeatureFlags({ [flag]: false });
  const route = serveHttpForTest({
    server: testServer({ featureFlags }),
    access: accessAs(authentication),
  });
  return {
    route,
    client: route.client(),
    evaluations: featureFlags.evaluations,
  };
};

const outcomeLines = (route: ReturnType<typeof serveHttpForTest>) =>
  route.logs
    .filter((line) => line.message === "rpc")
    .map(({ fields }) => [
      fields.procedure,
      fields.status,
      fields.code,
      fields.planningCenterRequests,
    ]);

const accountEvaluation = (flag: FeatureFlagName) => [
  {
    flag,
    subject: { userId: "user-1", planningCenterAccountId: "account-1" },
  },
];

describe("endpoints behind the people flag", () => {
  it.each([
    [
      "people.dashboardRoster",
      async (client: ProductClient) =>
        await client.run((api) => api.people.dashboardRoster()),
    ],
    [
      "people.dashboardActivity",
      async (client: ProductClient) =>
        await client.run((api) =>
          api.people.dashboardActivity({ query: { personIds: ["person-1"] } })
        ),
    ],
    [
      "people.dashboardPerson",
      async (client: ProductClient) =>
        await client.run((api) =>
          api.people.dashboardPerson({
            params: { personId: "person-1" },
            payload: {},
          })
        ),
    ],
  ] as const)(
    "answer %s with NotFound before any Planning Center request while the flag is off",
    async (tag, call) => {
      const { route, client, evaluations } = flagOff(
        "people",
        accountAuthentication
      );

      const answer = call(client);

      await expect(answer).rejects.toBeInstanceOf(NotFound);
      await expect(answer).rejects.toMatchObject({
        resource: "people-dashboard",
      });
      expect(evaluations).toStrictEqual(accountEvaluation("people"));
      expect(outcomeLines(route)).toStrictEqual([[tag, 404, "NOT_FOUND", 0]]);
    }
  );

  it("evaluates a demo visitor anonymously", async () => {
    const { client, evaluations } = flagOff("people", demoAuthentication);

    await expect(
      client.run((api) => api.people.dashboardRoster())
    ).rejects.toBeInstanceOf(NotFound);

    expect(evaluations[0]?.subject).toStrictEqual({
      userId: null,
      planningCenterAccountId: null,
    });
  });

  it("evaluates no flag for an endpoint declared without one", async () => {
    const { client, evaluations } = flagOff("people", accountAuthentication);

    await client
      .run((api) => api.people.search({ query: { query: "ann" } }))
      .catch(() => null);

    expect(evaluations).toStrictEqual([]);
  });
});

describe("endpoints behind the chordCharts flag", () => {
  it.each([
    [
      "songs.library",
      async (client: ProductClient) =>
        await client.run((api) => api.songs.library()),
    ],
    [
      "chordCharts.update",
      async (client: ProductClient) =>
        await client.run((api) =>
          api.chordCharts.update({
            params: { songId: "song-1", arrangementId: "arrangement-1" },
            payload: {
              chordChart: "[C]Amazing grace",
              chordChartKey: "C",
              baseUpdatedAt: null,
            },
          })
        ),
    ],
    [
      "chordCharts.lyricsSearch",
      async (client: ProductClient) =>
        await client.run((api) =>
          api.chordCharts.lyricsSearch({ query: { query: "grace" } })
        ),
    ],
  ] as const)(
    "answer %s with NotFound while the flag is off, songs.library included",
    async (tag, call) => {
      const { route, client, evaluations } = flagOff(
        "chordCharts",
        accountAuthentication
      );

      const answer = call(client);

      await expect(answer).rejects.toBeInstanceOf(NotFound);
      await expect(answer).rejects.toMatchObject({ resource: "songs" });
      expect(evaluations).toStrictEqual(accountEvaluation("chordCharts"));
      expect(outcomeLines(route)).toStrictEqual([[tag, 404, "NOT_FOUND", 0]]);
    }
  );
});
