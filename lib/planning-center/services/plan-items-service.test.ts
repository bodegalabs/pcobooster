import { describe, expect, it, vi } from "vitest";

import type { PlanningCenterCoreClient } from "@/lib/planning-center/core-client";
import { PlanningCenterPlanItemsService } from "@/lib/planning-center/services/plan-items-service";
import type { PCResource } from "@/lib/types";

function createCoreClientMock() {
  const fetchAllWithIncluded = vi.fn();
  const fetch = vi.fn();
  const request = vi.fn();
  const core = {
    fetchAllWithIncluded,
    fetch,
    request,
    getCacheScope: () => "test-scope",
  } as unknown as PlanningCenterCoreClient;

  return { core, fetchAllWithIncluded, fetch, request };
}

function itemResource(id: string): PCResource {
  return {
    id,
    type: "Item",
    attributes: {
      title: "Opening Song",
    },
  };
}

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

    expect(fetchAllWithIncluded).toHaveBeenCalledTimes(1);
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
