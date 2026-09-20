import { runWithPlanningCenterRequestAuth } from "@worship-admin/api/planning-center/request-auth-context";
import { createPlanningCenterServices } from "@worship-admin/api/planning-center/services/factory";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PCResource } from "@worship-admin/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

const resource = (id: string, type: string): PCResource => ({
  id,
  type,
  attributes: { name: id },
});

describe("createPlanningCenterServices shared caches", () => {
  it("reuses cached reads for the same credential without leaking mutations", async () => {
    const first = createPlanningCenterServices("shared-cache-token");
    const second = createPlanningCenterServices("shared-cache-token");
    const firstLoad = vi
      .spyOn(first.catalog, "getServiceTypes")
      .mockResolvedValue([resource("first", "ServiceType")]);
    const secondLoad = vi
      .spyOn(second.catalog, "getServiceTypes")
      .mockResolvedValue([resource("second", "ServiceType")]);

    const firstResult = await first.catalog.getServiceTypesCached();
    firstResult[0].attributes.name = "mutated";
    const secondResult = await second.catalog.getServiceTypesCached();

    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).not.toHaveBeenCalled();
    expect(secondResult[0].attributes.name).toBe("first");
  });

  it("isolates shared caches by credential scope", async () => {
    const first = createPlanningCenterServices("isolated-cache-token-a");
    const second = createPlanningCenterServices("isolated-cache-token-b");
    const firstLoad = vi
      .spyOn(first.catalog, "getServiceTypes")
      .mockResolvedValue([resource("first", "ServiceType")]);
    const secondLoad = vi
      .spyOn(second.catalog, "getServiceTypes")
      .mockResolvedValue([resource("second", "ServiceType")]);

    const [firstResult, secondResult] = await Promise.all([
      first.catalog.getServiceTypesCached(),
      second.catalog.getServiceTypesCached(),
    ]);

    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).toHaveBeenCalledOnce();
    expect(firstResult[0].id).toBe("first");
    expect(secondResult[0].id).toBe("second");
  });

  it("invalidates another request service instance after a mutation", async () => {
    const first = createPlanningCenterServices("mutation-cache-token");
    const second = createPlanningCenterServices("mutation-cache-token");
    const load = vi
      .spyOn(first.core, "fetchAllWithIncluded")
      .mockResolvedValue({
        data: [resource("item-1", "Item")],
        included: [],
      });
    vi.spyOn(second.core, "fetchAllWithIncluded").mockResolvedValue({
      data: [resource("item-2", "Item")],
      included: [],
    });
    vi.spyOn(second.core, "fetch").mockResolvedValue({
      data: resource("item-2", "Item"),
      included: [],
    });

    await first.planItems.getPlanItems("service-type", "plan");
    await second.planItems.getPlanItems("service-type", "plan");
    await second.planItems.createPlanItem("service-type", "plan", {
      title: "New item",
    });
    await first.planItems.getPlanItems("service-type", "plan");

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares invalidation with the transitional singleton service", async () => {
    const accessToken = "singleton-bridge-token";
    const services = createPlanningCenterServices(accessToken);
    const load = vi
      .spyOn(services.core, "fetchAllWithIncluded")
      .mockResolvedValue({
        data: [resource("plan-person", "PlanPerson")],
        included: [],
      });

    await services.people.getPlanTeamMembers("service-type", "plan");
    runWithPlanningCenterRequestAuth({ accessToken }, () => {
      planningCenterPeopleService.invalidateScheduleReadCaches({
        serviceTypeId: "service-type",
        planId: "plan",
      });
    });
    await services.people.getPlanTeamMembers("service-type", "plan");

    expect(load).toHaveBeenCalledTimes(2);
  });
});
