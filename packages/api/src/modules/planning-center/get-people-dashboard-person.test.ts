import {
  getPeopleDashboardPerson,
  getPersonScheduleWindow,
} from "@pcobooster/api/modules/planning-center/get-people-dashboard-person";
import type { PeopleDashboardPersonDependencies } from "@pcobooster/api/modules/planning-center/get-people-dashboard-person";
import type { JsonObject } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

const LOS_ANGELES = "America/Los_Angeles";
const NOW = new Date("2026-09-24T18:00:00.000Z");

type PeopleReader = PeopleDashboardPersonDependencies["peopleService"];
type Collection = Effect.Success<
  ReturnType<PeopleReader["getPersonSchedulesAfter"]>
>;

const person: PCResource = {
  type: "Person",
  id: "person-1",
  attributes: {
    first_name: "Ada",
    last_name: "Lovelace",
    photo_thumbnail_url: null,
  },
};

const serviceType: PCResource = {
  type: "ServiceType",
  id: "service-type-1",
  attributes: { name: "Sunday" },
};

const planTime = (
  id: string,
  startsAt: string,
  timeType: "service" | "rehearsal" | "other",
  planId = "plan-1"
): PCResource => ({
  type: "PlanTime",
  id,
  attributes: { starts_at: startsAt, time_type: timeType },
  relationships: { plan: { data: { type: "Plan", id: planId } } },
});

const ids = (type: string, values: string[]) =>
  values.map((id) => ({ type, id }));

const schedule = ({
  id,
  planId,
  sortDate,
  status = "C",
  timeIds,
  position = "Keys",
}: {
  id: string;
  planId: string;
  sortDate: string;
  status?: string;
  timeIds: string[];
  position?: string;
}): PCResource => ({
  type: "Schedule",
  id,
  attributes: {
    sort_date: sortDate,
    status,
    team_name: "Band",
    team_position_name: position,
    service_type_name: "Sunday",
  } satisfies JsonObject,
  relationships: {
    plan: { data: { type: "Plan", id: planId } },
    plan_person: { data: { type: "PlanPerson", id } },
    service_type: { data: { type: "ServiceType", id: "service-type-1" } },
    times: { data: ids("PlanTime", timeIds) },
  },
});

const planPerson = ({
  id,
  planId,
  status,
  timeIds,
}: {
  id: string;
  planId: string;
  status: string;
  timeIds: string[];
}): PCResource => ({
  type: "PlanPerson",
  id,
  attributes: { status, team_position_name: "Vocals" },
  relationships: {
    plan: { data: { type: "Plan", id: planId } },
    team: { data: { type: "Team", id: "team-1" } },
    service_type: { data: { type: "ServiceType", id: "service-type-1" } },
    times: { data: ids("PlanTime", timeIds) },
  },
});

const emptyCollection = (): Collection => ({ data: [], included: [] });

interface Fixture {
  readonly schedules?: Collection;
  readonly planPeople?: Collection;
  readonly rangeIncluded?: PCResource[];
  readonly planPlanTimes?: Record<string, PCResource[]>;
  readonly cacheScope?: string;
}

const dependenciesFor = ({
  schedules = emptyCollection(),
  planPeople = emptyCollection(),
  rangeIncluded = [],
  planPlanTimes = {},
  cacheScope = crypto.randomUUID(),
}: Fixture = {}) => {
  const getPerson = vi
    .fn<PeopleReader["getPerson"]>()
    .mockReturnValue(Effect.succeed(person));
  const getPersonSchedulesAfter = vi
    .fn<PeopleReader["getPersonSchedulesAfter"]>()
    .mockReturnValue(Effect.succeed(schedules));
  const getPersonPlanPeople = vi
    .fn<PeopleReader["getPersonPlanPeople"]>()
    .mockReturnValue(Effect.succeed(planPeople));
  const getPlanPlanTimes = vi.fn<PeopleReader["getPlanPlanTimes"]>(
    (planId: string) => Effect.succeed(planPlanTimes[planId] ?? [])
  );
  const getServiceTypesCached = vi
    .fn<
      PeopleDashboardPersonDependencies["catalogService"]["getServiceTypesCached"]
    >()
    .mockReturnValue(Effect.succeed([serviceType]));
  const getPlansWithIncludedInDateRange = vi
    .fn<
      PeopleDashboardPersonDependencies["plansService"]["getPlansWithIncludedInDateRange"]
    >()
    .mockReturnValue(Effect.succeed({ data: [], included: rangeIncluded }));
  const dependencies: PeopleDashboardPersonDependencies = {
    peopleService: {
      getCacheScope: () => cacheScope,
      getPerson,
      getPersonSchedulesAfter,
      getPersonPlanPeople,
      getPlanPlanTimes,
    },
    catalogService: { getServiceTypesCached },
    plansService: { getPlansWithIncludedInDateRange },
    resolveTimeZone: Effect.succeed(LOS_ANGELES),
  };
  return {
    dependencies,
    getPerson,
    getPersonSchedulesAfter,
    getPersonPlanPeople,
    getPlanPlanTimes,
    getPlansWithIncludedInDateRange,
    getServiceTypesCached,
  };
};

const readDetail = async (
  dependencies: PeopleDashboardPersonDependencies,
  month = "2026-09"
) =>
  await Effect.runPromise(
    getPeopleDashboardPerson({ personId: "person-1", month, dependencies })
  );

describe(getPersonScheduleWindow, () => {
  it("starts at the earlier of the six trend months and the 90-day cadence window", () => {
    expect(
      getPersonScheduleWindow({ year: 2026, monthIndex: 8 }, NOW, LOS_ANGELES)
    ).toStrictEqual({
      startDayKey: "2026-04-01",
      afterDayKey: "2026-03-31",
      rangeEndDayKey: "2026-12-31",
      orgTimeZone: LOS_ANGELES,
    });
    expect(
      getPersonScheduleWindow({ year: 2027, monthIndex: 5 }, NOW, LOS_ANGELES)
    ).toStrictEqual({
      startDayKey: "2026-06-26",
      afterDayKey: "2026-06-25",
      rangeEndDayKey: "2027-06-30",
      orgTimeZone: LOS_ANGELES,
    });
  });
});

describe(getPeopleDashboardPerson, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("separates cached dashboard details by account service scope", async () => {
    vi.useFakeTimers({ now: NOW });
    const first = dependenciesFor({ cacheScope: "bearer:first" });
    const second = dependenciesFor({ cacheScope: "bearer:second" });

    await readDetail(first.dependencies);
    await readDetail(second.dependencies);

    expect(first.getPerson).toHaveBeenCalledOnce();
    expect(second.getPerson).toHaveBeenCalledOnce();
  });

  const augustAndSeptemberFixture = () =>
    dependenciesFor({
      schedules: {
        data: [
          schedule({
            id: "schedule-aug",
            planId: "plan-aug",
            sortDate: "2026-08-16T17:00:00Z",
            timeIds: ["time-aug-service"],
          }),
          schedule({
            id: "schedule-sep",
            planId: "plan-1",
            sortDate: "2026-09-13T17:00:00Z",
            timeIds: ["time-sep-rehearsal", "time-sep-service"],
          }),
        ],
        included: [
          planTime("time-aug-service", "2026-08-16T17:00:00Z", "service"),
          planTime("time-sep-service", "2026-09-13T17:00:00Z", "service"),
        ],
      },
      rangeIncluded: [
        planTime("time-sep-rehearsal", "2026-09-10T02:00:00Z", "rehearsal"),
      ],
    });

  it("reads the person's own schedules and one plan range per service type", async () => {
    vi.useFakeTimers({ now: NOW });
    const fixture = augustAndSeptemberFixture();

    await readDetail(fixture.dependencies);

    expect(fixture.getPersonSchedulesAfter).toHaveBeenCalledExactlyOnceWith(
      "person-1",
      "2026-03-31T07:00:00.000Z",
      5
    );
    expect(
      fixture.getPlansWithIncludedInDateRange
    ).toHaveBeenCalledExactlyOnceWith(
      "service-type-1",
      "2026-03-31",
      "2026-12-31",
      "plan_times",
      LOS_ANGELES
    );
    expect(fixture.getPlanPlanTimes).not.toHaveBeenCalled();
    expect(fixture.getServiceTypesCached).not.toHaveBeenCalled();
  });

  it("builds the month, cadence, and trend from distinct org calendar days", async () => {
    vi.useFakeTimers({ now: NOW });
    const fixture = augustAndSeptemberFixture();

    const detail = await readDetail(fixture.dependencies);
    const { person: summary } = detail;

    expect(summary.monthDays).toStrictEqual([
      {
        day: 9,
        kind: "rehearsal",
        positionName: "Keys",
        serviceTypeName: "Sunday",
        status: "C",
        planUrl: "/services/service-type-1/plans/plan-1/lineup",
      },
      {
        day: 13,
        kind: "service",
        positionName: "Keys",
        serviceTypeName: "Sunday",
        status: "C",
        planUrl: "/services/service-type-1/plans/plan-1/lineup",
      },
    ]);
    expect({
      monthCount: summary.monthCount,
      lastServed: summary.lastServed,
      lastRehearsal: summary.lastRehearsal,
      thirtyDayCount: summary.thirtyDayCount,
      ninetyDayCount: summary.ninetyDayCount,
    }).toStrictEqual({
      monthCount: 1,
      lastServed: "Sep 13",
      lastRehearsal: "Sep 9",
      thirtyDayCount: 1,
      ninetyDayCount: 2,
    });
    expect(
      detail.trend.map(
        ({ month, services, rehearsals }) =>
          `${month}:${services}/${rehearsals}`
      )
    ).toStrictEqual([
      "2026-04:0/0",
      "2026-05:0/0",
      "2026-06:0/0",
      "2026-07:0/0",
      "2026-08:1/0",
      "2026-09:1/1",
    ]);
  });

  it("places services by the organization's calendar day, not the UTC day", async () => {
    vi.useFakeTimers({ now: NOW });
    const fixture = dependenciesFor({
      schedules: {
        data: [
          schedule({
            id: "schedule-late",
            planId: "plan-late",
            sortDate: "2026-10-01T05:00:00Z",
            timeIds: ["time-late"],
          }),
        ],
        included: [planTime("time-late", "2026-10-01T05:00:00Z", "service")],
      },
    });

    const september = await readDetail(fixture.dependencies, "2026-09");

    expect(september.person.monthCount).toBe(1);
    expect(september.person.monthDays.map((day) => day.day)).toStrictEqual([
      30,
    ]);
    expect(september.trend.at(-1)?.services).toBe(1);
  });

  it("leaves declined schedules and declined requests out of every count", async () => {
    vi.useFakeTimers({ now: NOW });
    const fixture = dependenciesFor({
      schedules: {
        data: [
          schedule({
            id: "schedule-declined",
            planId: "plan-1",
            sortDate: "2026-09-13T17:00:00Z",
            status: "D",
            timeIds: ["time-sep-service"],
          }),
        ],
        included: [
          planTime("time-sep-service", "2026-09-13T17:00:00Z", "service"),
        ],
      },
      planPeople: {
        data: [
          planPerson({
            id: "plan-person-declined",
            planId: "plan-2",
            status: "D",
            timeIds: ["time-oct-service"],
          }),
        ],
        included: [],
      },
    });

    const detail = await readDetail(fixture.dependencies);

    expect(detail.person.monthCount).toBe(0);
    expect(detail.person.monthDays).toStrictEqual([]);
    expect(detail.person.upcomingCount).toBe(0);
    expect(detail.trend.every((month) => month.services === 0)).toBeTruthy();
    expect(fixture.getServiceTypesCached).not.toHaveBeenCalled();
  });

  it("counts upcoming requests that were prepared but not sent", async () => {
    vi.useFakeTimers({ now: NOW });
    const fixture = dependenciesFor({
      schedules: {
        data: [
          schedule({
            id: "plan-person-sent",
            planId: "plan-1",
            sortDate: "2026-09-27T17:00:00Z",
            timeIds: ["time-sent"],
          }),
        ],
        included: [planTime("time-sent", "2026-09-27T17:00:00Z", "service")],
      },
      planPeople: {
        data: [
          planPerson({
            id: "plan-person-sent",
            planId: "plan-1",
            status: "C",
            timeIds: ["time-sent"],
          }),
          planPerson({
            id: "plan-person-pending",
            planId: "plan-2",
            status: "U",
            timeIds: ["time-pending"],
          }),
        ],
        included: [
          {
            type: "Plan",
            id: "plan-2",
            attributes: { sort_date: "2026-09-26T15:00:00Z" },
          },
          { type: "Team", id: "team-1", attributes: { name: "Choir" } },
        ],
      },
      rangeIncluded: [
        planTime("time-pending", "2026-09-26T15:00:00Z", "service", "plan-2"),
      ],
    });

    const detail = await readDetail(fixture.dependencies);

    expect(detail.person.monthCount).toBe(2);
    expect(detail.person.upcomingCount).toBe(2);
    expect(detail.person.nextScheduled).toBe("Sep 26");
    expect(detail.person.monthDays).toContainEqual({
      day: 26,
      kind: "service",
      positionName: "Vocals",
      serviceTypeName: "Sunday",
      status: "U",
      planUrl: "/services/service-type-1/plans/plan-2/lineup",
    });
    expect(detail.person.teams).toStrictEqual(["Choir", "Band"]);
  });

  it("reads a plan's own times only when the plan range lacks them", async () => {
    vi.useFakeTimers({ now: NOW });
    const fixture = dependenciesFor({
      schedules: {
        data: [
          schedule({
            id: "schedule-sep",
            planId: "plan-1",
            sortDate: "2026-09-13T17:00:00Z",
            timeIds: ["time-sep-rehearsal", "time-sep-service"],
          }),
        ],
        included: [
          planTime("time-sep-service", "2026-09-13T17:00:00Z", "service"),
        ],
      },
      planPlanTimes: {
        "plan-1": [
          planTime("time-sep-rehearsal", "2026-09-12T17:00:00Z", "rehearsal"),
          planTime("time-sep-other", "2026-09-12T19:00:00Z", "other"),
        ],
      },
    });

    const detail = await readDetail(fixture.dependencies);

    expect(fixture.getPlanPlanTimes).toHaveBeenCalledExactlyOnceWith("plan-1");
    expect(detail.person.lastRehearsal).toBe("Sep 12");
    expect(detail.trend.at(-1)?.rehearsals).toBe(1);
  });
});
