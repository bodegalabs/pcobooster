import { createBasicPlanningCenterPromiseClient } from "@pcobooster/api/planning-center/promise-client";
import { PlanningCenterPlanItemsService } from "@pcobooster/api/planning-center/services/plan-items-service";
import { testPlanningCenterToken } from "@pcobooster/api/testing/server";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

const createCoreClientMock = () => {
  const core = createBasicPlanningCenterPromiseClient(testPlanningCenterToken);
  const fetchAllWithIncluded = vi.spyOn(core, "fetchAllWithIncluded");
  const fetch = vi.spyOn(core, "fetch");
  const request = vi.spyOn(core, "request");

  return { core, fetchAllWithIncluded, fetch, request };
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
    fetchAllWithIncluded.mockResolvedValue({
      data: [itemResource("item-1")],
      included: [itemResource("song-1")],
    });
    const service = new PlanningCenterPlanItemsService(core);

    const first = await service.getPlanItems("st-1", "plan-1");
    first.data[0].attributes.title = "Mutated";
    const second = await service.getPlanItems("st-1", "plan-1");

    expect(fetchAllWithIncluded).toHaveBeenCalledOnce();
    expect(second.data[0].attributes.title).toBe("Opening Song");
    expect(second.data[0]).not.toBe(first.data[0]);
  });

  it("invalidates cached plan items after create, update, delete, and reorder", async () => {
    const { core, fetchAllWithIncluded, fetch, request } =
      createCoreClientMock();
    fetchAllWithIncluded.mockResolvedValue({
      data: [itemResource("item-1")],
      included: [],
    });
    fetch.mockResolvedValue({ data: itemResource("item-2"), included: [] });
    request.mockResolvedValue(new Response(null, { status: 204 }));
    const service = new PlanningCenterPlanItemsService(core);

    await service.getPlanItems("st-1", "plan-1");
    await service.createPlanItem("st-1", "plan-1", { title: "New Item" });
    await service.getPlanItems("st-1", "plan-1");
    await service.updatePlanItem("st-1", "plan-1", "item-2", {
      title: "Updated",
    });
    await service.getPlanItems("st-1", "plan-1");
    await service.deletePlanItem("st-1", "plan-1", "item-2");
    await service.getPlanItems("st-1", "plan-1");
    await service.reorderPlanItems("st-1", "plan-1", ["item-1"]);
    await service.getPlanItems("st-1", "plan-1");

    expect(fetchAllWithIncluded).toHaveBeenCalledTimes(5);
  });
});
