import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
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
  const fetchAllWithIncluded = vi.spyOn(core, "fetchAllWithIncluded");

  return { core, fetchAllWithIncluded };
};

const itemResource = (id: string): PCResource => ({
  id,
  type: "Item",
  attributes: {
    title: "Opening Song",
  },
});

describe("PlanningCenterPlanItemsService read cache", () => {
  it("caches plan item reads and returns mutation-safe copies", async () => {
    const { core, fetchAllWithIncluded } = createCoreClientMock();
    fetchAllWithIncluded.mockReturnValue(
      Effect.succeed({
        data: [itemResource("item-1")],
        included: [itemResource("song-1")],
      })
    );
    const service = new PlanningCenterPlanItemsService(core);

    const first = await Effect.runPromise(
      service.getPlanItems("st-1", "plan-1")
    );
    first.data[0].attributes.title = "Mutated";
    const second = await Effect.runPromise(
      service.getPlanItems("st-1", "plan-1")
    );

    expect(fetchAllWithIncluded).toHaveBeenCalledOnce();
    expect(second.data[0].attributes.title).toBe("Opening Song");
    expect(second.data[0]).not.toBe(first.data[0]);
  });

  it("invalidates cached plan items after create, update, delete, and reorder", async () => {
    const item = { id: "item-1", type: "Item", attributes: { title: "Song" } };
    const fetch = vi.fn<typeof globalThis.fetch>(
      async (input, init) =>
        await Promise.resolve(
          new URL(urlOf(input)).pathname.endsWith("/items") &&
            (init?.method ?? "GET") === "GET"
            ? Response.json({ data: [item], included: [] })
            : Response.json({ data: item })
        )
    );
    const service = new PlanningCenterPlanItemsService(
      createBasicPlanningCenterClient(
        testPlanningCenterToken,
        httpClientFor(fetch)
      )
    );

    await Effect.runPromise(service.getPlanItems("st-1", "plan-1"));
    await Effect.runPromise(service.getPlanItems("st-1", "plan-1"));
    await Effect.runPromise(
      service.createPlanItem("st-1", "plan-1", { title: "New Item" })
    );
    await Effect.runPromise(service.getPlanItems("st-1", "plan-1"));
    await Effect.runPromise(
      service.updatePlanItem("st-1", "plan-1", "item-1", {
        title: "Updated",
      })
    );
    await Effect.runPromise(service.getPlanItems("st-1", "plan-1"));
    await Effect.runPromise(service.deletePlanItem("st-1", "plan-1", "item-1"));
    await Effect.runPromise(service.getPlanItems("st-1", "plan-1"));
    await Effect.runPromise(
      service.reorderPlanItems("st-1", "plan-1", ["item-1"])
    );
    await Effect.runPromise(service.getPlanItems("st-1", "plan-1"));

    expect(
      fetch.mock.calls.map(
        ([input, init]) =>
          `${init?.method ?? "GET"} ${new URL(urlOf(input)).pathname}`
      )
    ).toStrictEqual([
      "GET /services/v2/service_types/st-1/plans/plan-1/items",
      "POST /services/v2/service_types/st-1/plans/plan-1/items",
      "GET /services/v2/service_types/st-1/plans/plan-1/items",
      "PATCH /services/v2/service_types/st-1/plans/plan-1/items/item-1",
      "GET /services/v2/service_types/st-1/plans/plan-1/items",
      "DELETE /services/v2/service_types/st-1/plans/plan-1/items/item-1",
      "GET /services/v2/service_types/st-1/plans/plan-1/items",
      "POST /services/v2/service_types/st-1/plans/plan-1/item_reorder",
      "GET /services/v2/service_types/st-1/plans/plan-1/items",
    ]);
  });
});
