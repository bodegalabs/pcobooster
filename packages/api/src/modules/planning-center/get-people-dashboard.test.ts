import { getPeopleDashboard } from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { afterEach, describe, expect, it, vi } from "vitest";

const person = (
  id: string,
  firstName: string,
  lastName: string
): PCResource => ({
  id,
  type: "Person",
  attributes: {
    first_name: firstName,
    last_name: lastName,
  },
});

const schedule = (id: string, startsAt: string): PCResource => ({
  id,
  type: "Schedule",
  attributes: {
    sort_date: startsAt,
    status: "C",
    team_position_name: "Vocals",
    service_type_name: "Sunday",
  },
});

const createReader = (scope: string, people: PCResource[]) => ({
  getCacheScope: vi
    .fn<PlanningCenterPeopleService["getCacheScope"]>()
    .mockReturnValue(scope),
  getAllPeopleFromTeams: vi
    .fn<PlanningCenterPeopleService["getAllPeopleFromTeams"]>()
    .mockResolvedValue({
      people,
      included: [],
      teamNamesByPersonId: new Map(),
    }),
  getPersonSchedules: vi
    .fn<PlanningCenterPeopleService["getPersonSchedules"]>()
    .mockResolvedValue({ data: [], included: [] }),
});

describe(getPeopleDashboard, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates a bounded roster sample for the initial dashboard response", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-23T12:00:00.000Z") });
    const resolveTimeZone = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("UTC");
    const getAllPeopleFromTeams = vi
      .fn<PlanningCenterPeopleService["getAllPeopleFromTeams"]>()
      .mockResolvedValue({
        people: [
          person("person-3", "Casey", "Carter"),
          person("person-1", "Alex", "Adams"),
          person("person-2", "Blair", "Baker"),
        ],
        included: [],
        teamNamesByPersonId: new Map([
          ["person-1", new Set(["Band"])],
          ["person-2", new Set(["Band"])],
          ["person-3", new Set(["Band"])],
        ]),
      });
    const getPersonSchedules = vi.fn<
      PlanningCenterPeopleService["getPersonSchedules"]
    >(
      async (personId: string) =>
        await Promise.resolve({
          data:
            personId === "person-1"
              ? [schedule("schedule-1", "2026-05-31T17:00:00.000Z")]
              : [],
          included: [],
        })
    );

    const dashboard = await getPeopleDashboard({
      maxHydratedPeople: 2,
      peopleService: {
        getCacheScope: vi
          .fn<PlanningCenterPeopleService["getCacheScope"]>()
          .mockReturnValue("hydration-test"),
        getAllPeopleFromTeams,
        getPersonSchedules,
      },
      resolveTimeZone,
    });

    expect(getPersonSchedules).toHaveBeenCalledTimes(2);
    expect(
      getPersonSchedules.mock.calls.map(([personId]) => personId)
    ).toStrictEqual(["person-1", "person-2"]);
    expect(
      dashboard.people.map((dashboardPerson) => dashboardPerson.id)
    ).toStrictEqual(["person-1", "person-2"]);
    expect(dashboard.requestBudget).toMatchObject({
      rosterPeopleCount: 3,
      hydratedPeopleCount: 2,
      scheduleRequests: 2,
      sampled: true,
    });
    expect(dashboard.stats.scheduledPeople).toBe(1);
  });

  it("reuses a reader's cached result until the TTL expires", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-23T12:00:00.000Z") });
    const reader = createReader("ttl-scope", [
      person("person-1", "Alex", "Adams"),
    ]);
    const resolveTimeZone = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("UTC");
    const options = { peopleService: reader, resolveTimeZone };

    const first = await getPeopleDashboard(options);
    const reused = await getPeopleDashboard(options);
    expect(reused).toBe(first);
    expect(reader.getAllPeopleFromTeams).toHaveBeenCalledOnce();

    vi.setSystemTime(new Date("2026-05-23T12:02:01.000Z"));
    const refreshed = await getPeopleDashboard(options);
    expect(refreshed).not.toBe(first);
    expect(reader.getAllPeopleFromTeams).toHaveBeenCalledTimes(2);
  });

  it("reuses cached results across request readers for one credential scope", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-23T12:00:00.000Z") });
    const firstReader = createReader("shared-scope", [
      person("person-1", "Alex", "Adams"),
    ]);
    const secondReader = createReader("shared-scope", [
      person("person-2", "Blair", "Baker"),
    ]);
    const resolveTimeZone = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("UTC");

    const first = await getPeopleDashboard({
      peopleService: firstReader,
      resolveTimeZone,
    });
    const second = await getPeopleDashboard({
      peopleService: secondReader,
      resolveTimeZone,
    });

    expect(
      first.people.map((dashboardPerson) => dashboardPerson.id)
    ).toStrictEqual(["person-1"]);
    expect(second).toBe(first);
    expect(
      second.people.map((dashboardPerson) => dashboardPerson.id)
    ).toStrictEqual(["person-1"]);
    expect(firstReader.getAllPeopleFromTeams).toHaveBeenCalledOnce();
    expect(secondReader.getAllPeopleFromTeams).not.toHaveBeenCalled();
  });

  it("isolates cached results for different credential scopes", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-23T12:00:00.000Z") });
    const firstReader = createReader("account:first", [
      person("person-1", "Alex", "Adams"),
    ]);
    const secondReader = createReader("account:second", [
      person("person-2", "Blair", "Baker"),
    ]);
    const resolveTimeZone = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("UTC");

    const first = await getPeopleDashboard({
      peopleService: firstReader,
      resolveTimeZone,
    });
    const second = await getPeopleDashboard({
      peopleService: secondReader,
      resolveTimeZone,
    });

    expect(first.people.map(({ id }) => id)).toStrictEqual(["person-1"]);
    expect(second.people.map(({ id }) => id)).toStrictEqual(["person-2"]);
    expect(firstReader.getAllPeopleFromTeams).toHaveBeenCalledOnce();
    expect(secondReader.getAllPeopleFromTeams).toHaveBeenCalledOnce();
  });

  it("keys cached dashboard data by the resolved organization time zone", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-01T01:00:00.000Z") });
    const reader = createReader("time-zone-scope", []);
    const resolveTimeZone = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("UTC")
      .mockResolvedValue("America/Los_Angeles");
    const options = { peopleService: reader, resolveTimeZone };

    const utcDashboard = await getPeopleDashboard(options);
    const losAngelesDashboard = await getPeopleDashboard(options);

    expect(utcDashboard.month.label).toBe("May 2026");
    expect(losAngelesDashboard.month.label).toBe("April 2026");
    expect(reader.getAllPeopleFromTeams).toHaveBeenCalledTimes(2);
  });

  it("passes the request signal to timezone resolution and roster reads", async () => {
    const reader = createReader("signal-dashboard-scope", []);
    const resolveTimeZone = vi
      .fn<(signal?: AbortSignal) => Promise<string>>()
      .mockResolvedValue("UTC");
    const controller = new AbortController();

    await getPeopleDashboard(
      { peopleService: reader, resolveTimeZone },
      controller.signal
    );

    expect(resolveTimeZone).toHaveBeenCalledWith(controller.signal);
    expect(reader.getAllPeopleFromTeams).toHaveBeenCalledWith(
      expect.any(AbortSignal)
    );
  });
});
