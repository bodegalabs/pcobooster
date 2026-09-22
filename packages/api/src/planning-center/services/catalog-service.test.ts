import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

const createCoreClientMock = () => {
  const core = createBasicPlanningCenterClient();
  const fetchMock = vi.spyOn(core, "fetch");
  const fetchCollectionMock = vi.spyOn(core, "fetchCollection");
  const fetchAllMock = vi.spyOn(core, "fetchAll");
  const fetchAllWithIncludedMock = vi.spyOn(core, "fetchAllWithIncluded");
  return {
    core,
    fetchMock,
    fetchCollectionMock,
    fetchAllMock,
    fetchAllWithIncludedMock,
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
    fetchAllMock.mockResolvedValue([resource("st-1", "ServiceType")]);
    const service = new PlanningCenterCatalogService(core);

    const first = await service.getServiceTypesCached();
    first[0].attributes.name = "Mutated";
    const second = await service.getServiceTypesCached();

    expect(fetchAllMock).toHaveBeenCalledOnce();
    expect(fetchAllMock.mock.calls[0]?.slice(0, 3)).toStrictEqual([
      "/services/v2/service_types",
      {},
      10,
    ]);
    expect(fetchAllMock.mock.calls[0]?.[3]).toBeInstanceOf(AbortSignal);
    expect(second[0].attributes.name).toBe("Acoustic Guitar");
    expect(second[0]).not.toBe(first[0]);
  });

  it("caches service type team positions and returns mutation-safe copies", async () => {
    const { core, fetchCollectionMock } = createCoreClientMock();
    fetchCollectionMock.mockResolvedValue({
      data: [resource("position-1")],
      included: [resource("team-1", "Team")],
    });
    const service = new PlanningCenterCatalogService(core);

    const first = await service.getServiceTypeTeamPositionsWithTeams("st-1");
    first.data[0].attributes.name = "Mutated";
    const second = await service.getServiceTypeTeamPositionsWithTeams("st-1");

    expect(fetchCollectionMock).toHaveBeenCalledOnce();
    expect(second.data[0].attributes.name).toBe("Acoustic Guitar");
    expect(second.data[0]).not.toBe(first.data[0]);
  });

  it("caches plan needed positions through the shared cache", async () => {
    const { core, fetchAllWithIncludedMock } = createCoreClientMock();
    fetchAllWithIncludedMock.mockResolvedValue({
      data: [resource("needed-1", "NeededPosition")],
      included: [resource("team-1", "Team")],
    });
    const service = new PlanningCenterCatalogService(core);

    await service.getServiceTypePlanNeededPositionsWithTeams("st-1", "plan-1");
    await service.getServiceTypePlanNeededPositionsWithTeams("st-1", "plan-1");

    expect(fetchAllWithIncludedMock).toHaveBeenCalledOnce();
    expect(fetchAllWithIncludedMock.mock.calls[0]?.slice(0, 3)).toStrictEqual([
      "/services/v2/service_types/st-1/plans/plan-1/needed_positions",
      { include: "team" },
      5,
    ]);
    expect(fetchAllWithIncludedMock.mock.calls[0]?.[3]).toBeInstanceOf(
      AbortSignal
    );
  });
});
