import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import {
  noContentResponse,
  unreachableHttpClient,
} from "@pcobooster/api/testing/http-client";
import { planningCenterBudgetFailures } from "@pcobooster/api/testing/planning-center-failures";
import { testPlanningCenterToken } from "@pcobooster/api/testing/server";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

const resolveTimeZone = Effect.succeed("America/Los_Angeles");

const planResource = (id: string, sortDate: string): PCResource => ({
  id,
  type: "Plan",
  attributes: {
    sort_date: sortDate,
  },
});

describe("PlanningCenterPlansService.getPlansWithIncludedInDateRange", () => {
  it("caches range reads and returns mutation-safe copies", async () => {
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const fetchAllWithIncluded = vi
      .spyOn(core, "fetchAllWithIncluded")
      .mockReturnValue(
        Effect.succeed({
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
        })
      );
    const service = new PlanningCenterPlansService(core, resolveTimeZone);

    const first = await Effect.runPromise(
      service.getPlansWithIncludedInDateRange(
        "st-1",
        "2026-05-23",
        "2026-06-30",
        "series"
      )
    );
    first.data[0].attributes.sort_date = "mutated";
    first.included[0].attributes.title = "Mutated Series";

    const second = await Effect.runPromise(
      service.getPlansWithIncludedInDateRange(
        "st-1",
        "2026-05-23",
        "2026-06-30",
        "series"
      )
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
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const fetchAll = vi.spyOn(core, "fetchAll").mockReturnValue(
      Effect.succeed([
        {
          id: "time-1",
          type: "PlanTime",
          attributes: { name: "Service", starts_at: "2026-05-24T16:30:00Z" },
        },
      ])
    );
    const service = new PlanningCenterPlansService(core, resolveTimeZone);

    const first = await Effect.runPromise(
      service.getPlanTimes("st-1", "plan-1")
    );
    first[0].attributes.name = "Mutated";
    const second = await Effect.runPromise(
      service.getPlanTimes("st-1", "plan-1")
    );

    expect(fetchAll).toHaveBeenCalledOnce();
    expect(fetchAll.mock.calls[0]?.slice(0, 3)).toStrictEqual([
      "/services/v2/service_types/st-1/plans/plan-1/plan_times",
      {
        order: "starts_at",
        per_page: "200",
        include: "split_team_rehearsal_assignments",
      },
      10,
    ]);
    expect(second[0].attributes.name).toBe("Service");
  });

  it("patches plan times through the service-type plan-time endpoint", async () => {
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const fetch = vi.spyOn(core, "fetch").mockReturnValue(
      Effect.succeed({
        data: {
          id: "time-1",
          type: "PlanTime",
          attributes: { name: "Updated" },
        },
      })
    );
    const service = new PlanningCenterPlansService(core, resolveTimeZone);

    await Effect.runPromise(
      service.updatePlanTime(
        "st-1",
        "plan-1",
        "time-1",
        {
          name: "Updated",
        },
        ["team-1"]
      )
    );

    expect(fetch).toHaveBeenCalledWith(
      "/services/v2/service_types/st-1/plan_times/time-1",
      expect.objectContaining({
        method: "PATCH",
        body: {
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
        },
      })
    );
  });

  it("creates plan times through the plan-scoped endpoint", async () => {
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const fetch = vi.spyOn(core, "fetch").mockReturnValue(
      Effect.succeed({
        data: {
          id: "time-new",
          type: "PlanTime",
          attributes: { name: "New service" },
        },
      })
    );
    const service = new PlanningCenterPlansService(core, resolveTimeZone);

    await Effect.runPromise(
      service.createPlanTime(
        "st-1",
        "plan-1",
        {
          name: "New service",
          starts_at: "2026-05-24T18:00:00.000Z",
        },
        ["team-1"]
      )
    );

    expect(fetch).toHaveBeenCalledWith(
      "/services/v2/service_types/st-1/plans/plan-1/plan_times",
      expect.objectContaining({
        method: "POST",
        body: {
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
        },
      })
    );
  });

  it("deletes plan times through the service-type plan-time endpoint", async () => {
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const request = vi
      .spyOn(core, "request")
      .mockReturnValue(Effect.succeed(noContentResponse()));
    const service = new PlanningCenterPlansService(core, resolveTimeZone);

    await Effect.runPromise(service.deletePlanTime("st-1", "plan-1", "time-1"));

    expect(request).toHaveBeenCalledWith(
      "/services/v2/service_types/st-1/plan_times/time-1",
      {
        method: "DELETE",
      }
    );
  });

  it("treats missing plan times as already deleted", async () => {
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const request = vi.spyOn(core, "request").mockReturnValue(
      Effect.fail(
        new PlanningCenterApiError({
          message: "Planning Center API error: 404",
          status: 404,
        })
      )
    );
    const service = new PlanningCenterPlansService(core, resolveTimeZone);

    await expect(
      Effect.runPromise(service.deletePlanTime("st-1", "plan-1", "time-1"))
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
  });

  it.each(planningCenterBudgetFailures())(
    "fails a delete with %s instead of treating it as done",
    async (failure) => {
      const core = createBasicPlanningCenterClient(
        testPlanningCenterToken,
        unreachableHttpClient
      );
      vi.spyOn(core, "request").mockReturnValue(Effect.fail(failure));
      const service = new PlanningCenterPlansService(core, resolveTimeZone);

      await expect(
        Effect.runPromiseExit(
          service.deletePlanTime("st-1", "plan-1", "time-1")
        )
      ).resolves.toStrictEqual(Exit.fail(failure));
    }
  );
});
