import { getPeopleDashboardPerson } from "@pcobooster/api/modules/planning-center/get-people-dashboard-person";
import type { PeopleDashboardPersonDependencies } from "@pcobooster/api/modules/planning-center/get-people-dashboard-person";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
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
      .mockReturnValue(Effect.succeed(person)),
    getPersonSchedules: vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPersonSchedules"]
      >()
      .mockReturnValue(Effect.succeed(emptySchedules)),
    getPlanTeamMembers: vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanTeamMembers"]
      >()
      .mockReturnValue(Effect.succeed(emptySchedules)),
    getPlanPlanTimes: vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanPlanTimes"]
      >()
      .mockReturnValue(Effect.succeed([])),
  },
  catalogService: {
    getServiceTypesCached: vi
      .fn<
        PeopleDashboardPersonDependencies["catalogService"]["getServiceTypesCached"]
      >()
      .mockReturnValue(Effect.succeed([])),
  },
  plansService: {
    getPlansInDateRange: vi
      .fn<
        PeopleDashboardPersonDependencies["plansService"]["getPlansInDateRange"]
      >()
      .mockReturnValue(Effect.succeed([])),
  },
  resolveTimeZone: Effect.succeed("America/Los_Angeles"),
});

describe(getPeopleDashboardPerson, () => {
  it("separates cached dashboard details by account service scope", async () => {
    const first = dependenciesFor("bearer:first");
    const second = dependenciesFor("bearer:second");

    await Effect.runPromise(
      getPeopleDashboardPerson({
        personId: "person-1",
        month: "2026-09",
        dependencies: first,
      })
    );
    await Effect.runPromise(
      getPeopleDashboardPerson({
        personId: "person-1",
        month: "2026-09",
        dependencies: second,
      })
    );

    expect(first.peopleService.getPerson).toHaveBeenCalledOnce();
    expect(second.peopleService.getPerson).toHaveBeenCalledOnce();
  });

  it("hydrates roster items through injected request-owned services", async () => {
    const getPerson = vi
      .fn<PeopleDashboardPersonDependencies["peopleService"]["getPerson"]>()
      .mockReturnValue(Effect.succeed(person));
    const getPersonSchedules = vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPersonSchedules"]
      >()
      .mockReturnValue(Effect.succeed(emptySchedules));
    const getPlanTeamMembers = vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanTeamMembers"]
      >()
      .mockReturnValue(Effect.succeed(rosterMembers));
    const getPlanPlanTimes = vi
      .fn<
        PeopleDashboardPersonDependencies["peopleService"]["getPlanPlanTimes"]
      >()
      .mockReturnValue(Effect.succeed([rosterPlanTime]));
    const getServiceTypesCached = vi
      .fn<
        PeopleDashboardPersonDependencies["catalogService"]["getServiceTypesCached"]
      >()
      .mockReturnValue(Effect.succeed([rosterServiceType]));
    const getPlansInDateRange = vi
      .fn<
        PeopleDashboardPersonDependencies["plansService"]["getPlansInDateRange"]
      >()
      .mockReturnValue(Effect.succeed([rosterPlan]));
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
      resolveTimeZone: Effect.succeed("America/Los_Angeles"),
    };

    const detail = await Effect.runPromise(
      getPeopleDashboardPerson({
        personId: "person-1",
        month: "2026-09",
        dependencies,
      })
    );

    expect(detail.person.monthCount).toBe(1);
    expect(getPlansInDateRange).toHaveBeenCalledOnce();
    expect(getPlanTeamMembers).toHaveBeenCalledOnce();
  });

  it("reads the person and every service type for the requested month", async () => {
    const dependencies = dependenciesFor("reads-person-scope");

    await Effect.runPromise(
      getPeopleDashboardPerson({
        personId: "person-1",
        month: "2026-09",
        dependencies,
      })
    );

    expect(dependencies.peopleService.getPerson).toHaveBeenCalledWith(
      "person-1"
    );
    expect(
      dependencies.catalogService.getServiceTypesCached
    ).toHaveBeenCalledWith();
  });
});
