import { describe, expect, it, vi } from "vitest";

import type { PlanningCenterCoreClient } from "@/lib/planning-center/core-client";
import { PlanningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import type { PCResource } from "@/lib/types";

function createCoreClientMock() {
  const fetchMock = vi.fn();
  const fetchAllMock = vi.fn();
  const fetchAllWithIncludedMock = vi.fn();
  const core = {
    fetch: fetchMock,
    fetchAll: fetchAllMock,
    fetchAllWithIncluded: fetchAllWithIncludedMock,
    getCacheScope: () => "test-scope",
  } as unknown as PlanningCenterCoreClient;
  return { core, fetchMock, fetchAllMock, fetchAllWithIncludedMock };
}

function resource(id: string, type: string = "TeamPosition"): PCResource {
  return {
    id,
    type,
    attributes: { name: "Acoustic Guitar" },
  };
}

describe("PlanningCenterCatalogService read cache", () => {
  it("caches service types and returns mutation-safe copies", async () => {
    const { core, fetchAllMock } = createCoreClientMock();
    fetchAllMock.mockResolvedValue([resource("st-1", "ServiceType")]);
    const service = new PlanningCenterCatalogService(core);

    const first = await service.getServiceTypesCached();
    first[0].attributes.name = "Mutated";
    const second = await service.getServiceTypesCached();

    expect(fetchAllMock).toHaveBeenCalledTimes(1);
    expect(fetchAllMock).toHaveBeenCalledWith("/services/v2/service_types", {});
    expect(second[0].attributes.name).toBe("Acoustic Guitar");
    expect(second[0]).not.toBe(first[0]);
  });

  it("caches service type team positions and returns mutation-safe copies", async () => {
    const { core, fetchMock } = createCoreClientMock();
    fetchMock.mockResolvedValue({
      data: [resource("position-1")],
      included: [resource("team-1", "Team")],
    });
    const service = new PlanningCenterCatalogService(core);

    const first = await service.getServiceTypeTeamPositionsWithTeams("st-1");
    first.data[0].attributes.name = "Mutated";
    const second = await service.getServiceTypeTeamPositionsWithTeams("st-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

    expect(fetchAllWithIncludedMock).toHaveBeenCalledTimes(1);
    expect(fetchAllWithIncludedMock).toHaveBeenCalledWith(
      "/services/v2/service_types/st-1/plans/plan-1/needed_positions",
      { include: "team" }
    );
  });
});
