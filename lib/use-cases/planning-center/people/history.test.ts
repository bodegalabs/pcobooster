import { describe, expect, it } from "vitest";

import type { PCResource, RawPlanPerson } from "@/lib/types";
import {
  buildHistoryAndFrequencyForPerson,
  buildHistoryAndFrequencyForPlanPeople,
} from "@/lib/use-cases/planning-center/people/history";

function schedule(params: {
  id: string;
  sortDate: string;
  status?: string;
  teamId?: string;
  serviceTypeId?: string;
  teamName?: string;
  positionName?: string;
  planTimeIds?: string[];
}): PCResource {
  const relationships: PCResource["relationships"] = {};
  if (params.teamId) {
    relationships.team = { data: { type: "Team", id: params.teamId } };
  }
  if (params.serviceTypeId) {
    relationships.service_type = {
      data: { type: "ServiceType", id: params.serviceTypeId },
    };
  }
  if (params.planTimeIds) {
    relationships.plan_times = {
      data: params.planTimeIds.map((id) => ({ type: "PlanTime", id })),
    };
  }

  return {
    type: "Schedule",
    id: params.id,
    attributes: {
      status: params.status ?? "C",
      sort_date: params.sortDate,
      team_name: params.teamName ?? "Band",
      team_position_name: params.positionName ?? "Band - Guitar",
      service_type_name: "Sunday",
    },
    relationships,
  };
}

function planTime(
  id: string,
  timeType: "service" | "rehearsal" | "other"
): PCResource {
  return {
    type: "PlanTime",
    id,
    attributes: {
      time_type: timeType,
      starts_at: "2026-02-01T00:00:00Z",
      ends_at: "2026-02-01T01:00:00Z",
    },
  };
}

function team(id: string, rehearsalTeam: boolean): PCResource {
  return {
    type: "Team",
    id,
    attributes: {
      name: rehearsalTeam ? "Rehearsal Team" : "Band",
      sequence: 1,
      rehearsal_team: rehearsalTeam,
      archived_at: null,
    },
  };
}

describe("buildHistoryAndFrequencyForPerson", () => {
  it("classifies rehearsal/service entries and tracks counters separately", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");
    const schedules = [
      schedule({
        id: "s-service",
        sortDate: "2026-02-15T00:00:00Z",
        planTimeIds: ["pt-service"],
      }),
      schedule({
        id: "s-rehearsal",
        sortDate: "2026-02-20T00:00:00Z",
        planTimeIds: ["pt-rehearsal"],
      }),
      schedule({
        id: "s-fallback-rehearsal",
        sortDate: "2026-02-25T00:00:00Z",
        teamId: "team-reh",
      }),
    ] as unknown as Parameters<typeof buildHistoryAndFrequencyForPerson>[0];

    const included = [
      {
        ...planTime("pt-service", "service"),
        attributes: {
          time_type: "service",
          starts_at: "2026-02-15T00:00:00Z",
          ends_at: "2026-02-15T01:00:00Z",
        },
      },
      {
        ...planTime("pt-rehearsal", "rehearsal"),
        attributes: {
          time_type: "rehearsal",
          starts_at: "2026-02-20T00:00:00Z",
          ends_at: "2026-02-20T01:00:00Z",
        },
      },
      team("team-reh", true),
    ] as PCResource[];

    const result = buildHistoryAndFrequencyForPerson(
      schedules,
      included,
      referenceDate,
      {},
      4,
      "UTC"
    );

    expect(
      result.serviceHistory.some((item) => item.timeType === "service")
    ).toBe(true);
    expect(
      result.serviceHistory.some((item) => item.timeType === "rehearsal")
    ).toBe(true);
    expect(
      result.serviceHistory.find((item) => item.id === "s-fallback-rehearsal")
        ?.timeType
    ).toBe("rehearsal");

    expect(result.frequency.recentServedDays).toBe(1);
    expect(result.frequency.recentRehearsalOnlyDays).toBe(1);
    expect(result.frequency.upcomingRehearsals).toBe(1);
    expect(result.frequency.upcomingServices).toBe(0);
  });

  it("creates separate history rows when one schedule has both service and rehearsal plan_times", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");
    const schedules = [
      schedule({
        id: "s-mixed",
        sortDate: "2026-02-22T00:00:00Z",
        planTimeIds: ["pt-service-1", "pt-rehearsal-1"],
      }),
    ] as unknown as Parameters<typeof buildHistoryAndFrequencyForPerson>[0];

    const included = [
      {
        ...planTime("pt-service-1", "service"),
        attributes: {
          time_type: "service",
          starts_at: "2026-02-22T00:00:00Z",
          ends_at: "2026-02-22T01:00:00Z",
        },
      },
      {
        ...planTime("pt-rehearsal-1", "rehearsal"),
        attributes: {
          time_type: "rehearsal",
          starts_at: "2026-02-20T17:00:00Z",
          ends_at: "2026-02-20T18:00:00Z",
        },
      },
    ] as PCResource[];

    const result = buildHistoryAndFrequencyForPerson(
      schedules,
      included,
      referenceDate,
      {},
      Number.POSITIVE_INFINITY,
      "UTC"
    );

    expect(result.serviceHistory).toHaveLength(2);
    expect(
      result.serviceHistory
        .map((i) => i.timeType)
        .sort((a, b) => String(a).localeCompare(String(b)))
    ).toEqual(["rehearsal", "service"]);
    expect(result.frequency.recentServedDays).toBe(1);
    expect(result.frequency.recentRehearsalOnlyDays).toBe(1);
  });
});

describe("declined assignments", () => {
  it("omits declined schedules from history and frequency (schedule-based)", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");
    const schedules = [
      schedule({
        id: "s-declined",
        sortDate: "2026-02-10T00:00:00Z",
        status: "D",
        planTimeIds: ["pt-d"],
      }),
      schedule({
        id: "s-confirmed",
        sortDate: "2026-02-12T00:00:00Z",
        status: "C",
        planTimeIds: ["pt-ok"],
      }),
    ] as unknown as Parameters<typeof buildHistoryAndFrequencyForPerson>[0];

    const included = [
      {
        ...planTime("pt-d", "service"),
        attributes: {
          time_type: "service",
          starts_at: "2026-02-10T00:00:00Z",
          ends_at: "2026-02-10T01:00:00Z",
        },
      },
      {
        ...planTime("pt-ok", "service"),
        attributes: {
          time_type: "service",
          starts_at: "2026-02-12T00:00:00Z",
          ends_at: "2026-02-12T01:00:00Z",
        },
      },
    ] as PCResource[];

    const result = buildHistoryAndFrequencyForPerson(
      schedules,
      included,
      referenceDate,
      {},
      Number.POSITIVE_INFINITY,
      "UTC"
    );

    expect(
      result.serviceHistory.every((h) => h.sourceScheduleId !== "s-declined")
    ).toBe(true);
    expect(
      result.serviceHistory.some((h) => h.sourceScheduleId === "s-confirmed")
    ).toBe(true);
    expect(result.frequency.recentServedDays).toBe(1);
    expect(result.frequency.totalServed).toBe(1);
  });

  it("omits declined plan_people from history and frequency", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");
    const planOk = "plan-ok";
    const planNo = "plan-no";
    const included: PCResource[] = [
      {
        type: "Plan",
        id: planOk,
        attributes: {
          title: "Ok",
          sort_date: "2026-02-12T00:00:00Z",
          created_at: "2026-02-12T00:00:00Z",
        },
        relationships: {
          service_type: { data: { type: "ServiceType", id: "st-1" } },
        },
      },
      {
        type: "Plan",
        id: planNo,
        attributes: {
          title: "Declined plan",
          sort_date: "2026-02-10T00:00:00Z",
          created_at: "2026-02-10T00:00:00Z",
        },
        relationships: {
          service_type: { data: { type: "ServiceType", id: "st-1" } },
        },
      },
    ];

    const planPeople: RawPlanPerson[] = [
      {
        type: "PlanPerson",
        id: "pp-d",
        attributes: {
          status: "D",
          created_at: "2026-02-01T00:00:00Z",
          team_position_name: "Band - Vocals",
        },
        relationships: {
          plan: { data: { type: "Plan", id: planNo } },
          team: { data: { type: "Team", id: "team-1" } },
        },
      },
      {
        type: "PlanPerson",
        id: "pp-c",
        attributes: {
          status: "C",
          created_at: "2026-02-01T00:00:00Z",
          team_position_name: "Band - Vocals",
        },
        relationships: {
          plan: { data: { type: "Plan", id: planOk } },
          team: { data: { type: "Team", id: "team-1" } },
        },
      },
    ] as RawPlanPerson[];

    const result = buildHistoryAndFrequencyForPlanPeople(
      planPeople,
      included,
      referenceDate,
      {},
      new Map(),
      Number.POSITIVE_INFINITY,
      "UTC"
    );

    expect(
      result.serviceHistory.some((h) => h.sourceScheduleId === "pp-d")
    ).toBe(false);
    expect(
      result.serviceHistory.some((h) => h.sourceScheduleId === "pp-c")
    ).toBe(true);
    expect(result.frequency.recentServedDays).toBe(1);
  });
});
