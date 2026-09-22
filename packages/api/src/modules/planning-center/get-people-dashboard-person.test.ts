import { getPeopleDashboardPerson } from "@pcobooster/api/modules/planning-center/get-people-dashboard-person";
import type { PeopleDashboardPersonDependencies } from "@pcobooster/api/modules/planning-center/get-people-dashboard-person";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

const person: PCResource = {
  type: "Person",
  id: "person-1",
  attributes: {
    first_name: "Ada",
    last_name: "Lovelace",
    photo_thumbnail_url: null,
  },
};

const emptySchedules = { data: [], included: [] } satisfies {
  data: PCResource[];
  included: PCResource[];
};

const rosterServiceType: PCResource = {
  type: "ServiceType",
  id: "service-type-1",
  attributes: { name: "Sunday" },
};

const rosterPlan: PCResource = {
  type: "Plan",
  id: "plan-1",
  attributes: { sort_date: "2026-09-14T17:00:00.000Z" },
};

const rosterMembers = {
  data: [
    {
      type: "PlanPerson",
      id: "plan-person-1",
      attributes: { status: "C", team_position_name: "Keys" },
      relationships: {
        person: { data: { type: "Person", id: "person-1" } },
        team: { data: { type: "Team", id: "team-1" } },
      },
    },
  ],
  included: [
    person,
    { type: "Team", id: "team-1", attributes: { name: "Band" } },
  ],
} satisfies { data: PCResource[]; included: PCResource[] };

const rosterPlanTime: PCResource = {
  type: "PlanTime",
  id: "plan-time-1",
  attributes: {
    starts_at: "2026-09-14T17:00:00.000Z",
    time_type: "service",
  },
};

const dependenciesFor = (
  cacheScope: string
): PeopleDashboardPersonDependencies => ({
  peopleService: {
    getCacheScope: () => cacheScope,
    getPerson: vi
      .fn<PeopleDashboardPersonDependencies["peopleService"]["getPerson"]>()
      .mockResolvedValue(person),
    getPersonSchedules: vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPersonSchedules"]
      >()
      .mockResolvedValue(emptySchedules),
    getPlanTeamMembers: vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanTeamMembers"]
      >()
      .mockResolvedValue(emptySchedules),
    getPlanPlanTimes: vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanPlanTimes"]
      >()
      .mockResolvedValue([]),
  },
  catalogService: {
    getServiceTypesCached: vi
      .fn<
        PeopleDashboardPersonDependencies["catalogService"]["getServiceTypesCached"]
      >()
      .mockResolvedValue([]),
  },
  plansService: {
    getPlansInDateRange: vi
      .fn<
        PeopleDashboardPersonDependencies["plansService"]["getPlansInDateRange"]
      >()
      .mockResolvedValue([]),
  },
  resolveTimeZone: vi
    .fn<PeopleDashboardPersonDependencies["resolveTimeZone"]>()
    .mockResolvedValue("America/Los_Angeles"),
});

describe(getPeopleDashboardPerson, () => {
  it("separates cached dashboard details by account service scope", async () => {
    const first = dependenciesFor("bearer:first");
    const second = dependenciesFor("bearer:second");

    await getPeopleDashboardPerson({
      personId: "person-1",
      month: "2026-09",
      dependencies: first,
    });
    await getPeopleDashboardPerson({
      personId: "person-1",
      month: "2026-09",
      dependencies: second,
    });

    expect(first.peopleService.getPerson).toHaveBeenCalledOnce();
    expect(second.peopleService.getPerson).toHaveBeenCalledOnce();
  });

  it("hydrates roster items through injected request-owned services", async () => {
    const getPerson = vi
      .fn<PeopleDashboardPersonDependencies["peopleService"]["getPerson"]>()
      .mockResolvedValue(person);
    const getPersonSchedules = vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPersonSchedules"]
      >()
      .mockResolvedValue(emptySchedules);
    const getPlanTeamMembers = vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanTeamMembers"]
      >()
      .mockResolvedValue(rosterMembers);
    const getPlanPlanTimes = vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanPlanTimes"]
      >()
      .mockResolvedValue([rosterPlanTime]);
    const getServiceTypesCached = vi
      .fn<
        PeopleDashboardPersonDependencies["catalogService"]["getServiceTypesCached"]
      >()
      .mockResolvedValue([rosterServiceType]);
    const getPlansInDateRange = vi
      .fn<
        PeopleDashboardPersonDependencies["plansService"]["getPlansInDateRange"]
      >()
      .mockResolvedValue([rosterPlan]);
    const dependencies: PeopleDashboardPersonDependencies = {
      peopleService: {
        getCacheScope: () => "bearer:roster-test",
        getPerson,
        getPersonSchedules,
        getPlanTeamMembers,
        getPlanPlanTimes,
      },
      catalogService: { getServiceTypesCached },
      plansService: { getPlansInDateRange },
      resolveTimeZone: vi
        .fn<PeopleDashboardPersonDependencies["resolveTimeZone"]>()
        .mockResolvedValue("America/Los_Angeles"),
    };

    const detail = await getPeopleDashboardPerson({
      personId: "person-1",
      month: "2026-09",
      dependencies,
    });

    expect(detail.person.monthCount).toBe(1);
    expect(getPlansInDateRange).toHaveBeenCalledOnce();
    expect(getPlanTeamMembers).toHaveBeenCalledOnce();
  });

  it("passes the request signal through detail reads", async () => {
    const dependencies = dependenciesFor("signal-person-scope");
    const controller = new AbortController();

    await getPeopleDashboardPerson(
      {
        personId: "person-1",
        month: "2026-09",
        dependencies,
      },
      controller.signal
    );

    expect(dependencies.resolveTimeZone).toHaveBeenCalledWith(
      controller.signal
    );
    expect(dependencies.peopleService.getPerson).toHaveBeenCalledWith(
      "person-1",
      expect.any(AbortSignal)
    );
    expect(
      dependencies.catalogService.getServiceTypesCached
    ).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });
});
