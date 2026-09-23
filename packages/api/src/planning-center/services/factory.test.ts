import {
  createPlanningCenterServices,
  createBasicPlanningCenterServices,
} from "@pcobooster/api/planning-center/services/factory";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { afterEach, describe, expect, it, vi } from "vitest";

const resource = (id: string, type: string): PCResource => ({
  id,
  type,
  attributes: { name: id },
});

describe("createPlanningCenterServices shared caches", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects empty request credentials and requires explicit Basic services", () => {
    expect(() => createPlanningCenterServices("")).toThrow(
      "requires a non-empty access token"
    );
    vi.stubEnv("PLANNING_CENTER_CLIENT", "");
    expect(() => createBasicPlanningCenterServices()).toThrow(
      "Missing PLANNING_CENTER_CLIENT"
    );
    vi.stubEnv("PLANNING_CENTER_CLIENT", "client");
    vi.stubEnv("PLANNING_CENTER_PAT", "pat");
    expect(createBasicPlanningCenterServices().core.getCacheScope()).toMatch(
      /^basic:/u
    );
  });

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

  it("shares schedule invalidation across request-owned services", async () => {
    const accessToken = "schedule-invalidation-token";
    const services = createPlanningCenterServices(accessToken);
    const mutationServices = createPlanningCenterServices(accessToken);
    const load = vi
      .spyOn(services.core, "fetchAllWithIncluded")
      .mockResolvedValue({
        data: [resource("plan-person", "PlanPerson")],
        included: [],
      });

    await services.people.getPlanTeamMembers("service-type", "plan");
    mutationServices.people.invalidateScheduleReadCaches({
      serviceTypeId: "service-type",
      planId: "plan",
    });
    await services.people.getPlanTeamMembers("service-type", "plan");

    expect(load).toHaveBeenCalledTimes(2);
  });
});
