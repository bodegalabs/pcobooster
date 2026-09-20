import { PlanningCenterApiError } from "@worship-admin/api/planning-center/api-error";
import { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import type { PCResource } from "@worship-admin/api/types";
import { describe, expect, it, vi } from "vitest";

const planResource = (id: string, sortDate: string): PCResource => ({
  id,
  type: "Plan",
  attributes: {
    sort_date: sortDate,
  },
});

describe("PlanningCenterPlansService.getPlansWithIncludedInDateRange", () => {
  it("caches range reads and returns mutation-safe copies", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAllWithIncluded = vi
      .spyOn(core, "fetchAllWithIncluded")
      .mockResolvedValue({
        data: [
          planResource("plan-1", "2026-05-24T10:00:00-07:00"),
          planResource("plan-2", "2026-06-01T10:00:00-07:00"),
        ],
        included: [
          {
            id: "series-1",
            type: "Series",
            attributes: { title: "Original Series" },
            relationships: {
              plan: { data: { id: "plan-1", type: "Plan" } },
            },
          },
        ],
      });
    const service = new PlanningCenterPlansService(
      core,
      async () => await Promise.resolve("America/Los_Angeles")
    );

    const first = await service.getPlansWithIncludedInDateRange(
      "st-1",
      "2026-05-23",
      "2026-06-30",
      "series"
    );
    first.data[0].attributes.sort_date = "mutated";
    first.included[0].attributes.title = "Mutated Series";

    const second = await service.getPlansWithIncludedInDateRange(
      "st-1",
      "2026-05-23",
      "2026-06-30",
      "series"
    );

    expect(fetchAllWithIncluded).toHaveBeenCalledOnce();
    expect(second.data[0].attributes.sort_date).toBe(
      "2026-05-24T10:00:00-07:00"
    );
    expect(second.included[0].attributes.title).toBe("Original Series");
  });
});

describe("PlanningCenterPlansService plan times", () => {
  it("fetches plan times through the service-type plan endpoint and returns cache-safe copies", async () => {
    const core = new PlanningCenterCoreClient();
    const fetchAll = vi.spyOn(core, "fetchAll").mockResolvedValue([
      {
        id: "time-1",
        type: "PlanTime",
        attributes: { name: "Service", starts_at: "2026-05-24T16:30:00Z" },
      },
    ]);
    const service = new PlanningCenterPlansService(core);

    const first = await service.getPlanTimes("st-1", "plan-1");
    first[0].attributes.name = "Mutated";
    const second = await service.getPlanTimes("st-1", "plan-1");

    expect(fetchAll).toHaveBeenCalledExactlyOnceWith(
      "/services/v2/service_types/st-1/plans/plan-1/plan_times",
      {
        order: "starts_at",
        per_page: "200",
        include: "split_team_rehearsal_assignments",
      }
    );
    expect(second[0].attributes.name).toBe("Service");
  });

  it("patches plan times through the service-type plan-time endpoint", async () => {
    const core = new PlanningCenterCoreClient();
    const fetch = vi.spyOn(core, "fetch").mockResolvedValue({
      data: {
        id: "time-1",
        type: "PlanTime",
        attributes: { name: "Updated" },
      },
    });
    const service = new PlanningCenterPlansService(core);

    await service.updatePlanTime(
      "st-1",
      "plan-1",
      "time-1",
      {
        name: "Updated",
      },
      ["team-1"]
    );

    expect(fetch).toHaveBeenCalledWith(
      "/services/v2/service_types/st-1/plan_times/time-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "PlanTime",
            id: "time-1",
            attributes: {
              name: "Updated",
            },
            relationships: {
              assigned_teams: {
                data: [{ type: "Team", id: "team-1" }],
              },
            },
          },
        }),
      })
    );
  });

  it("creates plan times through the plan-scoped endpoint", async () => {
    const core = new PlanningCenterCoreClient();
    const fetch = vi.spyOn(core, "fetch").mockResolvedValue({
      data: {
        id: "time-new",
        type: "PlanTime",
        attributes: { name: "New service" },
      },
    });
    const service = new PlanningCenterPlansService(core);

    await service.createPlanTime(
      "st-1",
      "plan-1",
      {
        name: "New service",
        starts_at: "2026-05-24T18:00:00.000Z",
      },
      ["team-1"]
    );

    expect(fetch).toHaveBeenCalledWith(
      "/services/v2/service_types/st-1/plans/plan-1/plan_times",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "PlanTime",
            attributes: {
              name: "New service",
              starts_at: "2026-05-24T18:00:00.000Z",
            },
            relationships: {
              assigned_teams: {
                data: [{ type: "Team", id: "team-1" }],
              },
            },
          },
        }),
      })
    );
  });

  it("deletes plan times through the service-type plan-time endpoint", async () => {
    const core = new PlanningCenterCoreClient();
    const request = vi
      .spyOn(core, "request")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const service = new PlanningCenterPlansService(core);

    await service.deletePlanTime("st-1", "plan-1", "time-1");

    expect(request).toHaveBeenCalledWith(
      "/services/v2/service_types/st-1/plan_times/time-1",
      {
        method: "DELETE",
      }
    );
  });

  it("treats missing plan times as already deleted", async () => {
    const core = new PlanningCenterCoreClient();
    const request = vi.spyOn(core, "request").mockRejectedValue(
      new PlanningCenterApiError({
        message: "Planning Center API error: 404",
        status: 404,
      })
    );
    const service = new PlanningCenterPlansService(core);

    await expect(
      service.deletePlanTime("st-1", "plan-1", "time-1")
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
  });
});
