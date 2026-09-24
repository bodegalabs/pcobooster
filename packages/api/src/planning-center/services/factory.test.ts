import {
  createPlanningCenterReadCaches,
  createPlanningCenterServices,
  createBasicPlanningCenterServices,
} from "@pcobooster/api/planning-center/services/factory";
import { createMemorySharedReadStore } from "@pcobooster/api/planning-center/services/shared-read-store";
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

const caches = createPlanningCenterReadCaches(null);

const servicesFor = (accessToken: string) =>
  createPlanningCenterServices(
    accessToken,
    TIME_ZONE,
    unreachableHttpClient,
    caches
  );

describe("createPlanningCenterServices shared caches", () => {
  it("rejects empty request credentials and scopes Basic services by credential", () => {
    expect(() => servicesFor("")).toThrow("requires a non-empty access token");
    expect(
      createBasicPlanningCenterServices(
        testPlanningCenterToken,
        TIME_ZONE,
        unreachableHttpClient,
        caches
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

const reportError = (message: string, error: Error) => {
  throw new Error(message, { cause: error });
};

describe("createPlanningCenterServices shared tier", () => {
  it("shares the song catalog across isolates for the same credential only", async () => {
    const store = createMemorySharedReadStore();
    const isolate = () =>
      createPlanningCenterReadCaches({ store, reportError });
    const secondIsolate = isolate();
    const servicesIn = (
      token: string,
      readCaches: ReturnType<typeof isolate>
    ) =>
      createPlanningCenterServices(
        token,
        TIME_ZONE,
        unreachableHttpClient,
        readCaches
      );
    const first = servicesIn("token-a", isolate());
    vi.spyOn(first.core, "fetchAll").mockReturnValue(
      Effect.succeed([resource("first", "Song")])
    );
    await Effect.runPromise(
      first.songs
        .getSongsCatalogCached("catalog")
        .pipe(Effect.ensuring(first.settleReadCaches))
    );

    const sameCredential = servicesIn("token-a", secondIsolate);
    const sameLoad = vi
      .spyOn(sameCredential.core, "fetchAll")
      .mockReturnValue(Effect.succeed([resource("reloaded", "Song")]));
    const otherCredential = servicesIn("token-b", secondIsolate);
    const otherLoad = vi
      .spyOn(otherCredential.core, "fetchAll")
      .mockReturnValue(Effect.succeed([resource("other", "Song")]));

    await expect(
      Effect.runPromise(sameCredential.songs.getSongsCatalogCached("catalog"))
    ).resolves.toMatchObject([{ id: "first" }]);
    await expect(
      Effect.runPromise(otherCredential.songs.getSongsCatalogCached("catalog"))
    ).resolves.toMatchObject([{ id: "other" }]);
    expect(sameLoad).not.toHaveBeenCalled();
    expect(otherLoad).toHaveBeenCalledOnce();
    expect([...store.entries.keys()].join(",")).not.toContain("token-");
  });

  it("never shares a cache that a mutation invalidates", () => {
    const services = createPlanningCenterServices(
      "invalidation-token",
      TIME_ZONE,
      unreachableHttpClient,
      createPlanningCenterReadCaches({
        store: createMemorySharedReadStore(),
        reportError,
      })
    );

    expect(() => {
      services.people.invalidateScheduleReadCaches({
        personId: "person",
        serviceTypeId: "service-type",
        planId: "plan",
      });
      services.people.invalidatePlanTimeSensitiveReadCaches("plan");
      services.plans.invalidatePlanTimesCache("service-type", "plan");
      services.catalog.invalidateNeededPositionsCache("service-type", "plan");
    }).not.toThrow();
  });
});
