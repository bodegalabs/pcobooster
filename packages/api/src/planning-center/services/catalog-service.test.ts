import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import {
  httpClientFor,
  unreachableHttpClient,
} from "@pcobooster/api/testing/http-client";
import { testPlanningCenterToken } from "@pcobooster/api/testing/server";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const urlOf = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : input.toString();

const createCoreClientMock = () => {
  const core = createBasicPlanningCenterClient(
    testPlanningCenterToken,
    unreachableHttpClient
  );
  const fetchMock = vi.spyOn(core, "fetch");
  const fetchCollectionMock = vi.spyOn(core, "fetchCollection");
  const fetchAllMock = vi.spyOn(core, "fetchAll");
  return {
    core,
    fetchMock,
    fetchCollectionMock,
    fetchAllMock,
  };
};

const resource = (id: string, type = "TeamPosition"): PCResource => ({
  id,
  type,
  attributes: { name: "Acoustic Guitar" },
});

describe("PlanningCenterCatalogService read cache", () => {
  it("caches service types and returns mutation-safe copies", async () => {
    const { core, fetchAllMock } = createCoreClientMock();
    fetchAllMock.mockReturnValue(
      Effect.succeed([resource("st-1", "ServiceType")])
    );
    const service = new PlanningCenterCatalogService(core);

    const first = await Effect.runPromise(service.getServiceTypesCached());
    first[0].attributes.name = "Mutated";
    const second = await Effect.runPromise(service.getServiceTypesCached());

    expect(fetchAllMock).toHaveBeenCalledOnce();
    expect(fetchAllMock.mock.calls[0]?.slice(0, 3)).toStrictEqual([
      "/services/v2/service_types",
      {},
      10,
    ]);
    expect(second[0].attributes.name).toBe("Acoustic Guitar");
    expect(second[0]).not.toBe(first[0]);
  });

  it("caches service type team positions and returns mutation-safe copies", async () => {
    const { core, fetchCollectionMock } = createCoreClientMock();
    fetchCollectionMock.mockReturnValue(
      Effect.succeed({
        data: [resource("position-1")],
        included: [resource("team-1", "Team")],
      })
    );
    const service = new PlanningCenterCatalogService(core);

    const first = await Effect.runPromise(
      service.getServiceTypeTeamPositionsWithTeams("st-1")
    );
    first.data[0].attributes.name = "Mutated";
    const second = await Effect.runPromise(
      service.getServiceTypeTeamPositionsWithTeams("st-1")
    );

    expect(fetchCollectionMock).toHaveBeenCalledOnce();
    expect(second.data[0].attributes.name).toBe("Acoustic Guitar");
    expect(second.data[0]).not.toBe(first.data[0]);
  });

  it("caches plan needed positions through the shared cache", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        await Promise.resolve(
          Response.json({
            data: [
              {
                id: "needed-1",
                type: "NeededPosition",
                attributes: { name: "Acoustic Guitar" },
              },
            ],
            included: [
              { id: "team-1", type: "Team", attributes: { name: "Band" } },
            ],
          })
        )
    );
    const service = new PlanningCenterCatalogService(
      createBasicPlanningCenterClient(
        testPlanningCenterToken,
        httpClientFor(fetch)
      )
    );

    const first = await Effect.runPromise(
      service.getServiceTypePlanNeededPositionsWithTeams("st-1", "plan-1")
    );
    const second = await Effect.runPromise(
      service.getServiceTypePlanNeededPositionsWithTeams("st-1", "plan-1")
    );

    expect(second).toStrictEqual(first);
    expect(second.data.map((position) => position.id)).toStrictEqual([
      "needed-1",
    ]);
    expect(fetch.mock.calls.map(([input]) => urlOf(input))).toStrictEqual([
      "https://api.planningcenteronline.com/services/v2/service_types/st-1/plans/plan-1/needed_positions?include=team&per_page=100",
    ]);
  });
});
