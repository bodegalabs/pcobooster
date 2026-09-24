import { buildHistoryAndFrequencyForPerson } from "@pcobooster/api/modules/planning-center/people/history";
import { scheduleResourceSchema } from "@pcobooster/api/modules/planning-center/people/resource-schemas";
import { buildFrequencyFromServiceHistory } from "@pcobooster/planning-center-models/candidate-frequency";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  PCResource,
  ServiceHistoryItem,
} from "@pcobooster/planning-center-models/types";
import { describe, expect, it } from "vitest";

const schedule = (params: {
  id: string;
  sortDate: string;
  status?: string;
  teamId?: string;
  serviceTypeId?: string;
  teamName?: string;
  positionName?: string;
  planTimeIds?: string[];
}): PCResource => {
  const relationships: PCResource["relationships"] = {};
  if (isNonEmptyString(params.teamId)) {
    relationships.team = { data: { type: "Team", id: params.teamId } };
  }
  if (isNonEmptyString(params.serviceTypeId)) {
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
      decline_reason: null,
    },
    relationships,
  };
};

const planTime = (
  id: string,
  timeType: "service" | "rehearsal" | "other"
): PCResource => ({
  type: "PlanTime",
  id,
  attributes: {
    time_type: timeType,
    starts_at: "2026-02-01T00:00:00Z",
    ends_at: "2026-02-01T01:00:00Z",
  },
});

const team = (id: string, rehearsalTeam: boolean): PCResource => ({
  type: "Team",
  id,
  attributes: {
    name: rehearsalTeam ? "Rehearsal Team" : "Band",
    sequence: 1,
    rehearsal_team: rehearsalTeam,
    archived_at: null,
  },
});

describe(buildHistoryAndFrequencyForPerson, () => {
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
    ].map((resource) => scheduleResourceSchema.parse(resource));

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
    ] satisfies PCResource[];

    const result = buildHistoryAndFrequencyForPerson(
      schedules,
      included,
      referenceDate,
      4,
      "UTC"
    );

    expect(
      result.serviceHistory.some((item) => item.timeType === "service")
    ).toBeTruthy();
    expect(
      result.serviceHistory.some((item) => item.timeType === "rehearsal")
    ).toBeTruthy();
    expect(
      result.serviceHistory.find((item) => item.id === "s-fallback-rehearsal")
        ?.timeType
    ).toBe("rehearsal");

    expect(result.frequency).toMatchObject({
      recentServedDays: 1,
      recentRehearsalOnlyDays: 1,
      upcomingRehearsals: 1,
      upcomingServices: 0,
    });
  });

  it("creates separate history rows when one schedule has both service and rehearsal plan_times", () => {
    const referenceDate = new Date("2026-02-22T00:00:00Z");
    const schedules = [
      schedule({
        id: "s-mixed",
        sortDate: "2026-02-22T00:00:00Z",
        planTimeIds: ["pt-service-1", "pt-rehearsal-1"],
      }),
    ].map((resource) => scheduleResourceSchema.parse(resource));

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
    ] satisfies PCResource[];

    const result = buildHistoryAndFrequencyForPerson(
      schedules,
      included,
      referenceDate,
      Number.POSITIVE_INFINITY,
      "UTC"
    );

    expect(result.serviceHistory).toHaveLength(2);
    expect(
      result.serviceHistory
        .map((i) => i.timeType)
        .toSorted((a, b) => String(a).localeCompare(String(b)))
    ).toStrictEqual(["rehearsal", "service"]);
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
    ].map((resource) => scheduleResourceSchema.parse(resource));

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
    ] satisfies PCResource[];

    const result = buildHistoryAndFrequencyForPerson(
      schedules,
      included,
      referenceDate,
      Number.POSITIVE_INFINITY,
      "UTC"
    );

    expect(
      result.serviceHistory.every((h) => h.sourceScheduleId !== "s-declined")
    ).toBeTruthy();
    expect(
      result.serviceHistory.some((h) => h.sourceScheduleId === "s-confirmed")
    ).toBeTruthy();
    expect(result.frequency.recentServedDays).toBe(1);
    expect(result.frequency.totalServed).toBe(1);
  });
});

describe(buildFrequencyFromServiceHistory, () => {
  it("finds nearest and latest service dates independent of input order", () => {
    const history: ServiceHistoryItem[] = [
      "2026-02-20",
      "2026-02-10",
      "2026-03-10",
      "2026-02-25",
    ].map((day) => ({
      id: day,
      sourceScheduleId: day,
      date: new Date(`${day}T12:00:00Z`),
      teamPositionName: "Guitar",
      status: "C",
      timeType: "service",
    }));
    const result = buildFrequencyFromServiceHistory(
      history,
      new Date("2026-02-22T12:00:00Z"),
      "UTC"
    );
    expect(result).toMatchObject({
      totalServed: 2,
      upcomingServices: 2,
      lastServedDate: new Date("2026-02-20T12:00:00Z"),
      nextUpcomingDate: new Date("2026-02-25T12:00:00Z"),
    });
  });
});
