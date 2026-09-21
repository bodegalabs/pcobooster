import {
  planPersonResourceSchema,
  scheduleResourceSchema,
} from "@worship-admin/api/modules/planning-center/people/resource-schemas";
import { describe, expect, it } from "vitest";

describe("people resource schemas", () => {
  it("accepts Planning Center PlanPerson payloads with null decline_reason", () => {
    const parsed = planPersonResourceSchema.parse({
      type: "PlanPerson",
      id: "pp-1",
      attributes: {
        status: "C",
        created_at: "2026-09-21T19:00:00Z",
        team_position_name: "Band - Bass Guitar",
        decline_reason: null,
        notes: null,
      },
      relationships: {
        person: {
          data: { type: "Person", id: "p-1" },
          links: { related: "https://api.planningcenteronline.com/person" },
        },
        plan: { data: { type: "Plan", id: "plan-1" } },
        team: { data: { type: "Team", id: "team-1" } },
        times: { data: [{ type: "PlanTime", id: "pt-1" }] },
        service_times: { data: [{ type: "PlanTime", id: "pt-1" }] },
      },
    });

    expect(parsed.attributes.decline_reason).toBeUndefined();
    expect(parsed.relationships?.person?.data).toMatchObject({
      id: "p-1",
    });
  });

  it("accepts Planning Center Schedule payloads with null decline_reason", () => {
    const parsed = scheduleResourceSchema.parse({
      type: "Schedule",
      id: "sched-1",
      attributes: {
        status: "C",
        sort_date: "2026-09-14T19:00:00Z",
        team_name: "Band",
        team_position_name: "Band - Bass Guitar",
        service_type_name: "Youth",
        decline_reason: null,
      },
      relationships: {
        plan: { data: { type: "Plan", id: "plan-1" } },
        team: { data: { type: "Team", id: "team-1" } },
        times: { data: [{ type: "PlanTime", id: "pt-1" }] },
      },
    });

    expect(parsed.attributes.decline_reason).toBeUndefined();
  });

  it("accepts PlanPerson relationship data that Planning Center omits or nulls", () => {
    const parsed = planPersonResourceSchema.parse({
      type: "PlanPerson",
      id: "pp-2",
      attributes: {
        status: "C",
        created_at: "2026-09-21T19:00:00Z",
        team_position_name: "Band - Bass Guitar",
      },
      relationships: {
        person: {
          links: { related: "https://api.planningcenteronline.com/person" },
        },
        plan: { data: null },
        team: {
          data: { type: "Team", id: "team-1" },
          links: { related: null },
        },
        times: { data: null },
        service_times: { links: { related: null } },
      },
    });

    expect(parsed.relationships?.plan?.data).toBeNull();
    expect(parsed.relationships?.times?.data).toBeNull();
    expect(parsed.relationships?.person?.data).toBeUndefined();
  });

  it("accepts Schedule to-many relationships with null data", () => {
    const parsed = scheduleResourceSchema.parse({
      type: "Schedule",
      id: "sched-2",
      attributes: {
        status: "C",
        sort_date: "2026-09-14T19:00:00Z",
      },
      relationships: {
        plan: { data: { type: "Plan", id: "plan-1" } },
        plan_times: { data: null, links: { related: null } },
        times: { data: [] },
      },
    });

    expect(parsed.relationships?.plan_times?.data).toBeNull();
    expect(parsed.relationships?.times?.data).toStrictEqual([]);
  });
});
