import { PlanningCenterApiError } from "@pcobooster/api/planning-center/api-error";
import { createBasicPlanningCenterClient } from "@pcobooster/api/planning-center/core-client";
import { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import {
  httpClientFor,
  unreachableHttpClient,
} from "@pcobooster/api/testing/http-client";
import { planningCenterBudgetFailures } from "@pcobooster/api/testing/planning-center-failures";
import { testPlanningCenterToken } from "@pcobooster/api/testing/server";
import type { JsonValue } from "@pcobooster/planning-center-models/json";
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

const urlOf = (input: RequestInfo | URL): string =>
  input instanceof Request ? input.url : input.toString();

interface SentRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/** A plans service over a fake Planning Center that answers each request with `answer`. */
const serviceOver = (answer: JsonValue) => {
  const sent: SentRequest[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    await Promise.resolve();
    sent.push({
      method: init?.method ?? "GET",
      path: new URL(urlOf(input)).pathname,
      body:
        init?.body instanceof Uint8Array
          ? JSON.parse(new TextDecoder().decode(init.body))
          : undefined,
    });
    return answer === null
      ? new Response(null, { status: 204 })
      : Response.json(answer);
  };
  const service = new PlanningCenterPlansService(
    createBasicPlanningCenterClient(
      testPlanningCenterToken,
      httpClientFor(fetch)
    ),
    resolveTimeZone
  );
  return { service, sent };
};

describe("PlanningCenterPlansService.getPlansWithIncludedInDateRange", () => {
  it("caches range reads and returns mutation-safe copies", async () => {
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const fetchPage = vi.spyOn(core, "fetchPage").mockReturnValue(
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
        nextOffset: null,
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

    expect(fetchPage).toHaveBeenCalledOnce();
    expect(second.data[0].attributes.sort_date).toBe(
      "2026-05-24T10:00:00-07:00"
    );
    expect(second.included[0].attributes.title).toBe("Original Series");
  });
});

describe("PlanningCenterPlansService.getPlanRangePage", () => {
  it("caches each page per account until the service type's plan times change", async () => {
    const core = createBasicPlanningCenterClient(
      testPlanningCenterToken,
      unreachableHttpClient
    );
    const fetchPage = vi.spyOn(core, "fetchPage").mockReturnValue(
      Effect.succeed({
        data: [planResource("plan-1", "2026-05-24T10:00:00-07:00")],
        included: [],
        nextOffset: 100,
      })
    );
    const service = new PlanningCenterPlansService(core, resolveTimeZone);
    const read = async (offset: number) =>
      await Effect.runPromise(
        service.getPlanRangePage("st-1", "2026-05-01", "plan_times", offset)
      );

    await read(0);
    await read(100);
    const page = await read(0);
    page.data[0].attributes.sort_date = "mutated";
    service.invalidatePlanTimesCache("st-1", "plan-1");
    const again = await read(0);

    expect({
      calls: fetchPage.mock.calls.map(([, params, offset]) => [params, offset]),
      copy: again.data[0].attributes.sort_date,
    }).toStrictEqual({
      calls: [0, 100, 0].map((offset) => [
        {
          order: "sort_date",
          filter: "after",
          after: "2026-05-01",
          include: "plan_times",
          "fields[Plan]":
            "title,series_title,sort_date,created_at,planning_center_url,plan_people_count,series,service_type,plan_times",
          "fields[PlanTime]": "name,starts_at,ends_at,time_type",
        },
        offset,
      ]),
      copy: "2026-05-24T10:00:00-07:00",
    });
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
        per_page: "100",
        include: "split_team_rehearsal_assignments",
      },
      10,
    ]);
    expect(second[0].attributes.name).toBe("Service");
  });

  it("patches plan times through the service-type plan-time endpoint", async () => {
    const { service, sent } = serviceOver({
      data: { id: "time-1", type: "PlanTime", attributes: { name: "Updated" } },
    });

    const updated = await Effect.runPromise(
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

    expect(updated.attributes.name).toBe("Updated");
    expect(sent).toStrictEqual([
      {
        method: "PATCH",
        path: "/services/v2/service_types/st-1/plan_times/time-1",
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
      },
    ]);
  });

  it("creates plan times through the plan-scoped endpoint", async () => {
    const { service, sent } = serviceOver({
      data: {
        id: "time-new",
        type: "PlanTime",
        attributes: { name: "New service" },
      },
    });

    const created = await Effect.runPromise(
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

    expect(created.id).toBe("time-new");
    expect(sent).toStrictEqual([
      {
        method: "POST",
        path: "/services/v2/service_types/st-1/plans/plan-1/plan_times",
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
      },
    ]);
  });

  it("deletes plan times through the service-type plan-time endpoint", async () => {
    const { service, sent } = serviceOver(null);

    await Effect.runPromise(service.deletePlanTime("st-1", "plan-1", "time-1"));

    expect(sent).toStrictEqual([
      {
        method: "DELETE",
        path: "/services/v2/service_types/st-1/plan_times/time-1",
        body: undefined,
      },
    ]);
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
