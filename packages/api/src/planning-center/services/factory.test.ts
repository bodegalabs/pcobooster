import {
  createPlanningCenterServices,
  createBasicPlanningCenterServices,
} from "@pcobooster/api/planning-center/services/factory";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { testPlanningCenterToken } from "@pcobooster/api/testing/server";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const TIME_ZONE = "America/Los_Angeles";

const resource = (id: string, type: string): PCResource => ({
  id,
  type,
  attributes: { name: id },
});

const servicesFor = (accessToken: string) =>
  createPlanningCenterServices(accessToken, TIME_ZONE, unreachableHttpClient);

describe("createPlanningCenterServices shared caches", () => {
  it("rejects empty request credentials and scopes Basic services by credential", () => {
    expect(() => servicesFor("")).toThrow("requires a non-empty access token");
    expect(
      createBasicPlanningCenterServices(
        testPlanningCenterToken,
        TIME_ZONE,
        unreachableHttpClient
      ).core.getCacheScope()
    ).toMatch(/^basic:/u);
  });

  it("reuses cached reads for the same credential without leaking mutations", async () => {
    const first = servicesFor("shared-cache-token");
    const second = servicesFor("shared-cache-token");
    const firstLoad = vi
      .spyOn(first.catalog, "getServiceTypes")
      .mockReturnValue(Effect.succeed([resource("first", "ServiceType")]));
    const secondLoad = vi
      .spyOn(second.catalog, "getServiceTypes")
      .mockReturnValue(Effect.succeed([resource("second", "ServiceType")]));

    const firstResult = await Effect.runPromise(
      first.catalog.getServiceTypesCached()
    );
    firstResult[0].attributes.name = "mutated";
    const secondResult = await Effect.runPromise(
      second.catalog.getServiceTypesCached()
    );

    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).not.toHaveBeenCalled();
    expect(secondResult[0].attributes.name).toBe("first");
  });

  it("isolates shared caches by credential scope", async () => {
    const first = servicesFor("isolated-cache-token-a");
    const second = servicesFor("isolated-cache-token-b");
    const firstLoad = vi
      .spyOn(first.catalog, "getServiceTypes")
      .mockReturnValue(Effect.succeed([resource("first", "ServiceType")]));
    const secondLoad = vi
      .spyOn(second.catalog, "getServiceTypes")
      .mockReturnValue(Effect.succeed([resource("second", "ServiceType")]));

    const [firstResult, secondResult] = await Effect.runPromise(
      Effect.all(
        [
          first.catalog.getServiceTypesCached(),
          second.catalog.getServiceTypesCached(),
        ],
        { concurrency: "unbounded" }
      )
    );

    expect(firstLoad).toHaveBeenCalledOnce();
    expect(secondLoad).toHaveBeenCalledOnce();
    expect(firstResult[0].id).toBe("first");
    expect(secondResult[0].id).toBe("second");
  });

  it("invalidates another request service instance after a mutation", async () => {
    const first = servicesFor("mutation-cache-token");
    const second = servicesFor("mutation-cache-token");
    const load = vi.spyOn(first.core, "fetchAllWithIncluded").mockReturnValue(
      Effect.succeed({
        data: [resource("item-1", "Item")],
        included: [],
      })
    );
    vi.spyOn(second.core, "fetchAllWithIncluded").mockReturnValue(
      Effect.succeed({
        data: [resource("item-2", "Item")],
        included: [],
      })
    );
    vi.spyOn(second.core, "fetch").mockReturnValue(
      Effect.succeed({
        data: resource("item-2", "Item"),
        included: [],
      })
    );

    await Effect.runPromise(
      first.planItems.getPlanItems("service-type", "plan")
    );
    await Effect.runPromise(
      second.planItems.getPlanItems("service-type", "plan")
    );
    await Effect.runPromise(
      second.planItems.createPlanItem("service-type", "plan", {
        title: "New item",
      })
    );
    await Effect.runPromise(
      first.planItems.getPlanItems("service-type", "plan")
    );

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares schedule invalidation across request-owned services", async () => {
    const accessToken = "schedule-invalidation-token";
    const services = servicesFor(accessToken);
    const mutationServices = servicesFor(accessToken);
    const load = vi
      .spyOn(services.core, "fetchAllWithIncluded")
      .mockReturnValue(
        Effect.succeed({
          data: [resource("plan-person", "PlanPerson")],
          included: [],
        })
      );

    await Effect.runPromise(
      services.people.getPlanTeamMembers("service-type", "plan")
    );
    mutationServices.people.invalidateScheduleReadCaches({
      serviceTypeId: "service-type",
      planId: "plan",
    });
    await Effect.runPromise(
      services.people.getPlanTeamMembers("service-type", "plan")
    );

    expect(load).toHaveBeenCalledTimes(2);
  });
});
