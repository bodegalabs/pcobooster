import { getPeopleForPosition } from "@pcobooster/api/modules/planning-center/get-people-for-position";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createFixture = () => {
  const mocks = {
    getServiceTypesCached:
      vi.fn<PlanningCenterCatalogService["getServiceTypesCached"]>(),
    getPeopleForTeamPosition:
      vi.fn<PlanningCenterPeopleService["getPeopleForTeamPosition"]>(),
    getPersonBlockouts:
      vi.fn<PlanningCenterPeopleService["getPersonBlockouts"]>(),
    getPersonBlockoutDates:
      vi.fn<PlanningCenterPeopleService["getPersonBlockoutDates"]>(),
    getPersonSchedules:
      vi.fn<PlanningCenterPeopleService["getPersonSchedules"]>(),
    getPlanTeamMembers:
      vi.fn<PlanningCenterPeopleService["getPlanTeamMembers"]>(),
    getPlansWithIncludedInDateRange:
      vi.fn<PlanningCenterPlansService["getPlansWithIncludedInDateRange"]>(),
    getCacheScope: vi.fn<PlanningCenterPeopleService["getCacheScope"]>(),
    resolveTimeZone: vi.fn<() => Promise<string>>(),
  };
  const dependencies = {
    catalog: { getServiceTypesCached: mocks.getServiceTypesCached },
    people: {
      getPeopleForTeamPosition: mocks.getPeopleForTeamPosition,
      getPersonBlockouts: mocks.getPersonBlockouts,
      getPersonBlockoutDates: mocks.getPersonBlockoutDates,
      getPersonSchedules: mocks.getPersonSchedules,
      getPlanTeamMembers: mocks.getPlanTeamMembers,
      getCacheScope: mocks.getCacheScope,
    },
    plans: {
      getPlansWithIncludedInDateRange: mocks.getPlansWithIncludedInDateRange,
    },
    resolveTimeZone: mocks.resolveTimeZone,
  } satisfies NonNullable<Parameters<typeof getPeopleForPosition>[1]>;
  return { mocks, dependencies };
};

const person = (id: string, first: string, last: string): PCResource => ({
  type: "Person",
  id,
  attributes: {
    first_name: first,
    last_name: last,
    photo_url: null,
    photo_thumbnail_url: null,
    archived_at: null,
  },
});

const assignment = (id: string, personId: string): PCResource => ({
  type: "PersonTeamPositionAssignment",
  id,
  attributes: {},
  relationships: {
    person: {
      data: { type: "Person", id: personId },
    },
  },
});

const team = (id: string, name: string): PCResource => ({
  type: "Team",
  id,
  attributes: {
    name,
    sequence: 1,
    rehearsal_team: false,
    archived_at: null,
  },
});

const teamPosition = (
  id: string,
  name: string,
  teamId: string
): PCResource => ({
  type: "TeamPosition",
  id,
  attributes: { name },
  relationships: {
    team: { data: { type: "Team", id: teamId } },
  },
});

const scheduleEntry = (params: {
  id: string;
  planId: string;
  teamId: string;
  status: string;
  teamName?: string;
  teamPositionName: string;
  sortDate?: string;
  timesIds?: string[];
}): PCResource => {
  const relationships: PCResource["relationships"] = {
    plan: { data: { type: "Plan", id: params.planId } },
    team: { data: { type: "Team", id: params.teamId } },
    plan_person: { data: { type: "PlanPerson", id: params.id } },
  };
  if (params.timesIds) {
    relationships.plan_times = {
      data: params.timesIds.map((id) => ({ type: "PlanTime", id })),
    };
  }

  return {
    type: "Schedule",
    id: params.id,
    attributes: {
      status: params.status,
      sort_date: `${params.sortDate ?? "2026-02-22"}T00:00:00Z`,
      ...(isNonEmptyString(params.teamName) ||
      params.teamPositionName.includes(" - ")
        ? {
            team_name:
              params.teamName ?? params.teamPositionName.split(" - ")[0],
          }
        : undefined),
      team_position_name: params.teamPositionName,
    },
    relationships,
  };
};

const planMemberEntry = (params: {
  id: string;
  personId: string;
  planId: string;
  teamId: string;
  status: string;
  teamPositionName: string;
}): PCResource => ({
  type: "PlanPerson",
  id: params.id,
  attributes: {
    status: params.status,
    created_at: "2026-02-22T00:00:00Z",
    team_position_name: params.teamPositionName,
    decline_reason: null,
  },
  relationships: {
    person: { data: { type: "Person", id: params.personId } },
    plan: { data: { type: "Plan", id: params.planId } },
    team: { data: { type: "Team", id: params.teamId } },
  },
});

const planEntry = (id: string, sortDate: string): PCResource => ({
  type: "Plan",
  id,
  attributes: {
    title: id,
    sort_date: `${sortDate}T00:00:00Z`,
    created_at: `${sortDate}T00:00:00Z`,
  },
});

const blockout = (
  id: string,
  startsAt: string,
  endsAt: string
): PCResource => ({
  type: "Blockout",
  id,
  attributes: {
    reason: "Away",
    starts_at: startsAt,
    ends_at: endsAt,
    description: "",
    share: true,
  },
});

/** Parent row from Services API for a recurring block: wide starts_at/ends_at; real days are on blockout_dates. */
const recurringWeeklyBlockout = (
  id: string,
  startsAt: string,
  endsAt: string
): PCResource => ({
  type: "Blockout",
  id,
  attributes: {
    reason: "Recurring",
    starts_at: startsAt,
    ends_at: endsAt,
    description: "",
    share: true,
    repeat_frequency: "every_1",
    repeat_period: "weekly",
  },
});

describe(getPeopleForPosition, () => {
  let cacheScopeIndex = 0;
  let mocks: ReturnType<typeof createFixture>["mocks"];
  let dependencies: ReturnType<typeof createFixture>["dependencies"];

  beforeEach(() => {
    ({ mocks, dependencies } = createFixture());
    cacheScopeIndex += 1;
    mocks.getCacheScope.mockImplementation(
      () => `test-scope-${cacheScopeIndex}`
    );
    mocks.getServiceTypesCached.mockResolvedValue([
      {
        type: "ServiceType",
        id: "st-1",
        attributes: { archived_at: null, sequence: 1, name: "Primary" },
      },
    ]);
    mocks.getPersonSchedules.mockResolvedValue({ data: [], included: [] });
    mocks.getPlanTeamMembers.mockResolvedValue({ data: [], included: [] });
    mocks.getPlansWithIncludedInDateRange.mockResolvedValue({
      data: [],
      included: [],
    });
    mocks.resolveTimeZone.mockResolvedValue("UTC");
  });

  it("marks selected plan scheduled/confirmed flags and sorts confirmed/scheduled before available/blocked", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-1";
    const planId = "plan-target";
    const date = "2026-02-22";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [
        assignment("a1", "p-confirmed"),
        assignment("a2", "p-scheduled"),
        assignment("a3", "p-available"),
        assignment("a4", "p-blocked"),
      ],
      included: [
        person("p-confirmed", "Alice", "Confirmed"),
        person("p-scheduled", "Bob", "Scheduled"),
        person("p-available", "Cara", "Available"),
        person("p-blocked", "Dan", "Blocked"),
        teamPosition(positionId, "Vocals", teamId),
        team(teamId, "Band"),
      ],
    });

    const scheduleResponseForPerson = (personId: string) => {
      if (personId === "p-confirmed") {
        return {
          data: [
            scheduleEntry({
              id: "pp-confirmed",
              planId,
              teamId,
              status: "C",
              teamPositionName: "Band - Vocals",
            }),
          ],
          included: [],
        };
      }

      if (personId === "p-scheduled") {
        return {
          data: [
            scheduleEntry({
              id: "pp-scheduled",
              planId,
              teamId,
              status: "U",
              teamPositionName: "Band - Vocals",
            }),
          ],
          included: [],
        };
      }

      return {
        data: [],
        included: [],
      };
    };
    mocks.getPersonSchedules.mockImplementation(
      async (personId: string) =>
        await Promise.resolve(scheduleResponseForPerson(personId))
    );

    mocks.getPersonBlockouts.mockImplementation(async (personId: string) => {
      if (personId === "p-blocked") {
        return await Promise.resolve([
          blockout("b1", "2026-02-22T00:00:00Z", "2026-02-22T23:59:59Z"),
        ]);
      }
      return await Promise.resolve([]);
    });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date,
      },
      dependencies
    );

    expect(result).toMatchObject([
      {
        id: "p-confirmed",
        isConfirmedForSelectedPlanPosition: true,
        isScheduledForSelectedPlanPosition: true,
        selectedPlanAssignmentLabels: ["Band - Vocals"],
        scheduledPlanPersonId: "pp-confirmed",
      },
      {
        id: "p-scheduled",
        isConfirmedForSelectedPlanPosition: false,
        isScheduledForSelectedPlanPosition: true,
        selectedPlanAssignmentLabels: ["Band - Vocals"],
        scheduledPlanPersonId: "pp-scheduled",
      },
      {
        id: "p-available",
        isScheduledForSelectedPlanPosition: false,
        selectedPlanAssignmentLabels: [],
      },
      { id: "p-blocked", isBlockedForDate: true },
    ]);
  });

  it("includes same-plan assignments from other positions as labels without marking the selected slot scheduled", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-guitar";
    const planId = "plan-target";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a1", "p1")],
      included: [
        person("p1", "Casey", "Elsewhere"),
        teamPosition(positionId, "Guitar", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPersonBlockouts.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({
      data: [
        scheduleEntry({
          id: "pp1",
          planId,
          teamId,
          status: "U",
          teamName: "Band",
          teamPositionName: "Keys",
        }),
      ],
      included: [],
    });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      isScheduledForSelectedPlanPosition: false,
      selectedPlanAssignmentLabels: ["Band - Keys"],
    });
    expect(result[0]?.scheduledPlanPersonId).toBeUndefined();
  });

  it("reuses derived candidate history for the same person and reference date across positions", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const planId = "plan-target";
    const personId = "p-shared";

    mocks.getPeopleForTeamPosition.mockImplementation(
      async (_serviceTypeId: string, positionId: string) =>
        await Promise.resolve({
          data: [assignment(`a-${positionId}`, personId)],
          included: [
            person(personId, "Shared", "Candidate"),
            teamPosition(
              positionId,
              positionId === "pos-vocals" ? "Vocals" : "Keys",
              teamId
            ),
            team(teamId, "Band"),
          ],
        })
    );
    mocks.getPersonBlockouts.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({
      data: [
        scheduleEntry({
          id: "pp-keys",
          planId,
          teamId,
          status: "U",
          teamName: "Band",
          teamPositionName: "Keys",
        }),
      ],
      included: [],
    });

    const vocalsResult = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId: "pos-vocals",
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );
    const keysResult = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId: "pos-keys",
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    expect(mocks.getPersonSchedules).toHaveBeenCalledOnce();
    expect(vocalsResult[0]).toMatchObject({
      selectedPlanAssignmentLabels: ["Band - Keys"],
      isScheduledForSelectedPlanPosition: false,
    });
    expect(keysResult[0]).toMatchObject({
      selectedPlanAssignmentLabels: ["Band - Keys"],
      isScheduledForSelectedPlanPosition: true,
    });
  });

  it("uses a shared plan-window history snapshot instead of per-person schedule reads", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-vocals";
    const planId = "plan-target";
    const previousPlanId = "plan-prev";
    const personId = "p-shared-window";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a1", personId)],
      included: [
        person(personId, "Window", "Candidate"),
        teamPosition(positionId, "Vocals", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPlansWithIncludedInDateRange.mockResolvedValue({
      data: [
        planEntry(previousPlanId, "2026-02-15"),
        planEntry(planId, "2026-02-22"),
      ],
      included: [],
    });
    const planMembersForPlan = (requestedPlanId: string) => {
      if (requestedPlanId === previousPlanId) {
        return {
          data: [
            planMemberEntry({
              id: "pp-prev",
              personId,
              planId: previousPlanId,
              teamId,
              status: "C",
              teamPositionName: "Band - Vocals",
            }),
          ],
          included: [
            person(personId, "Window", "Candidate"),
            team(teamId, "Band"),
            planEntry(previousPlanId, "2026-02-15"),
          ],
        };
      }

      return {
        data: [
          planMemberEntry({
            id: "pp-target",
            personId,
            planId,
            teamId,
            status: "U",
            teamPositionName: "Band - Vocals",
          }),
        ],
        included: [
          person(personId, "Window", "Candidate"),
          team(teamId, "Band"),
          planEntry(planId, "2026-02-22"),
        ],
      };
    };
    mocks.getPlanTeamMembers.mockImplementation(
      async (_serviceTypeId: string, requestedPlanId: string) =>
        await Promise.resolve(planMembersForPlan(requestedPlanId))
    );
    mocks.getPersonBlockouts.mockResolvedValue([]);

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    expect(mocks.getPersonSchedules).not.toHaveBeenCalled();
    expect(mocks.getPlanTeamMembers).toHaveBeenCalledTimes(2);
    expect({
      result,
      servedRecently: (result[0]?.frequency?.recentServedDays ?? 0) >= 1,
      hasPreviousPlanHistory: result[0]?.serviceHistory?.some(
        (entry) => entry.sourceScheduleId === "pp-prev"
      ),
    }).toMatchObject({
      result: [
        {
          isScheduledForSelectedPlanPosition: true,
          selectedPlanAssignmentLabels: ["Band - Vocals"],
        },
      ],
      servedRecently: true,
      hasPreviousPlanHistory: true,
    });
  });

  it("does not collapse every candidate to 50% when shared-window PlanPeople include null decline_reason", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-bass";
    const planId = "plan-target";
    const previousPlanId = "plan-prev";
    const recentPersonId = "p-recent";
    const unusedPersonId = "p-unused";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [
        assignment("a-recent", recentPersonId),
        assignment("a-unused", unusedPersonId),
      ],
      included: [
        person(recentPersonId, "Recent", "Player"),
        person(unusedPersonId, "Unused", "Player"),
        teamPosition(positionId, "Bass Guitar", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPlansWithIncludedInDateRange.mockResolvedValue({
      data: [
        planEntry(previousPlanId, "2026-02-15"),
        planEntry(planId, "2026-02-22"),
      ],
      included: [],
    });
    mocks.getPlanTeamMembers.mockImplementation(
      async (_serviceTypeId: string, requestedPlanId: string) => {
        if (requestedPlanId === previousPlanId) {
          return await Promise.resolve({
            data: [
              planMemberEntry({
                id: "pp-prev",
                personId: recentPersonId,
                planId: previousPlanId,
                teamId,
                status: "C",
                teamPositionName: "Band - Bass Guitar",
              }),
            ],
            included: [
              person(recentPersonId, "Recent", "Player"),
              team(teamId, "Band"),
              planEntry(previousPlanId, "2026-02-15"),
            ],
          });
        }

        return await Promise.resolve({ data: [], included: [] });
      }
    );
    mocks.getPersonBlockouts.mockResolvedValue([]);

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    const recent = result.find((row) => row.id === recentPersonId);
    const unused = result.find((row) => row.id === unusedPersonId);
    expect(recent?.frequency?.recentServedDays).toBeGreaterThan(0);
    expect(unused?.frequency?.recentServedDays ?? 0).toBe(0);
    expect(recent?.recommendationScore).not.toBe(unused?.recommendationScore);
  });

  it("includes adjacent history from other service types in the shared plan window", async () => {
    const serviceTypeId = "st-youth";
    const otherServiceTypeId = "st-sunday";
    const teamId = "team-1";
    const positionId = "pos-electric";
    const selectedPlanId = "plan-may-4";
    const adjacentPlanId = "plan-may-3";
    const personId = "p-michael";

    mocks.getServiceTypesCached.mockResolvedValue([
      {
        type: "ServiceType",
        id: serviceTypeId,
        attributes: { archived_at: null, sequence: 1, name: "Youth" },
      },
      {
        type: "ServiceType",
        id: otherServiceTypeId,
        attributes: { archived_at: null, sequence: 2, name: "Sunday" },
      },
    ]);
    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a1", personId)],
      included: [
        person(personId, "Michael", "Bortis"),
        teamPosition(positionId, "Lead Electric Guitar", teamId),
        team(teamId, "Band"),
      ],
    });
    const plansForServiceType = (requestedServiceTypeId: string) => {
      if (requestedServiceTypeId === serviceTypeId) {
        return {
          data: [planEntry(selectedPlanId, "2026-05-04")],
          included: [],
        };
      }

      if (requestedServiceTypeId === otherServiceTypeId) {
        return {
          data: [planEntry(adjacentPlanId, "2026-05-03")],
          included: [],
        };
      }

      return { data: [], included: [] };
    };
    mocks.getPlansWithIncludedInDateRange.mockImplementation(
      async (requestedServiceTypeId: string) =>
        await Promise.resolve(plansForServiceType(requestedServiceTypeId))
    );
    const planMembersForServiceType = (
      requestedServiceTypeId: string,
      requestedPlanId: string
    ) => {
      if (
        requestedServiceTypeId === serviceTypeId &&
        requestedPlanId === selectedPlanId
      ) {
        return {
          data: [],
          included: [
            person(personId, "Michael", "Bortis"),
            team(teamId, "Band"),
            planEntry(selectedPlanId, "2026-05-04"),
          ],
        };
      }

      if (
        requestedServiceTypeId === otherServiceTypeId &&
        requestedPlanId === adjacentPlanId
      ) {
        return {
          data: [
            planMemberEntry({
              id: "pp-may-3",
              personId,
              planId: adjacentPlanId,
              teamId,
              status: "C",
              teamPositionName: "Band - Electric Guitar - Rhythm",
            }),
          ],
          included: [
            person(personId, "Michael", "Bortis"),
            team(teamId, "Band"),
            planEntry(adjacentPlanId, "2026-05-03"),
          ],
        };
      }

      return { data: [], included: [] };
    };
    mocks.getPlanTeamMembers.mockImplementation(
      async (requestedServiceTypeId: string, requestedPlanId: string) =>
        await Promise.resolve(
          planMembersForServiceType(requestedServiceTypeId, requestedPlanId)
        )
    );
    mocks.getPersonBlockouts.mockResolvedValue([]);

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId: selectedPlanId,
        date: "2026-05-04",
      },
      dependencies
    );

    expect(mocks.getPersonSchedules).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.serviceHistory).toContainEqual(
      expect.objectContaining({ sourceScheduleId: "pp-may-3" })
    );
  });

  it("includes and marks a selected slot plan member even when they are not assigned to the position", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-vocals";
    const planId = "plan-target";
    const personId = "p-pending";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [],
      included: [
        teamPosition(positionId, "Vocals", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPlanTeamMembers.mockResolvedValue({
      data: [
        planMemberEntry({
          id: "pp-pending",
          personId,
          planId,
          teamId,
          status: "U",
          teamPositionName: "Vocals",
        }),
      ],
      included: [person(personId, "Pending", "Singer"), team(teamId, "Band")],
    });
    mocks.getPersonBlockouts.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({ data: [], included: [] });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    expect(result.map((row) => row.id)).toStrictEqual([personId]);
    expect(result[0]).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: false,
      scheduledPlanPersonId: "pp-pending",
      selectedPlanAssignmentLabels: ["Band - Vocals"],
    });
  });

  it("does not add unassigned people who are scheduled elsewhere on the selected plan", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-lead-guitar";
    const planId = "plan-target";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a-lead", "p-lead")],
      included: [
        person("p-lead", "Lead", "Candidate"),
        teamPosition(positionId, "Lead Guitar", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPlanTeamMembers.mockResolvedValue({
      data: [
        planMemberEntry({
          id: "pp-vocals",
          personId: "p-vocals",
          planId,
          teamId,
          status: "U",
          teamPositionName: "Vocals",
        }),
      ],
      included: [person("p-vocals", "Vocal", "Only"), team(teamId, "Band")],
    });
    mocks.getPersonBlockouts.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({ data: [], included: [] });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    expect(result.map((row) => row.id)).toStrictEqual(["p-lead"]);
  });

  it("matches selected plan when plan_person team_position_name is unprefixed (position only)", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-1";
    const planId = "plan-target";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a1", "p1")],
      included: [
        person("p1", "Una", "Prefixed"),
        teamPosition(positionId, "Vocals", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPersonBlockouts.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({
      data: [
        scheduleEntry({
          id: "pp1",
          planId,
          teamId,
          status: "U",
          teamPositionName: "Vocals",
        }),
      ],
      included: [],
    });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: false,
    });
  });

  it("does not mark selected plan scheduled when schedule team_name does not match selected team", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const otherTeamId = "team-2";
    const positionId = "pos-1";
    const planId = "plan-target";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a1", "p1")],
      included: [
        person("p1", "Team", "Mismatch"),
        teamPosition(positionId, "Vocals", teamId),
        team(teamId, "Band"),
        team(otherTeamId, "Choir"),
      ],
    });
    mocks.getPersonBlockouts.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({
      data: [
        scheduleEntry({
          id: "pp1",
          planId,
          teamId,
          status: "U",
          teamName: "Choir",
          teamPositionName: "Vocals",
        }),
      ],
      included: [],
    });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: "2026-02-22",
      },
      dependencies
    );

    expect(result[0]).toMatchObject({
      isScheduledForSelectedPlanPosition: false,
    });
    expect(result[0]?.scheduledPlanPersonId).toBeUndefined();
  });

  it("builds history from person schedules without prefetching plan team members", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-bass";
    const planEasterId = "plan-easter-am";
    const personId = "p-michael";
    const easterSortDay = "2026-04-05";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a-michael", personId)],
      included: [
        person(personId, "Michael", "Bortis"),
        teamPosition(positionId, "Bass Guitar", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPersonBlockouts.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({
      data: [
        scheduleEntry({
          id: "pp-from-schedules",
          planId: planEasterId,
          teamId,
          status: "C",
          teamPositionName: "Band - Bass Guitar",
          sortDate: easterSortDay,
        }),
      ],
      included: [],
    });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId: planEasterId,
        date: easterSortDay,
      },
      dependencies
    );

    expect(mocks.getPersonSchedules).toHaveBeenCalledOnce();
    expect(mocks.getPersonSchedules.mock.calls[0]?.slice(0, 3)).toStrictEqual([
      personId,
      { order: "-starts_at" },
      5,
    ]);
    expect(mocks.getPersonSchedules.mock.calls[0]?.[3]).toBeInstanceOf(
      AbortSignal
    );
    const [personRow] = result;
    if (!personRow?.serviceHistory || !personRow.frequency) {
      throw new Error("Expected service history and frequency");
    }
    const historyRow = personRow.serviceHistory.find(
      (h) => h.teamPositionName === "Band - Bass Guitar"
    );
    expect({
      resultLength: result.length,
      hasHistoryRow: historyRow !== undefined,
      hasServed: personRow.frequency.totalServed >= 1,
      servedRecently: personRow.frequency.recentServedDays >= 1,
    }).toStrictEqual({
      resultLength: 1,
      hasHistoryRow: true,
      hasServed: true,
      servedRecently: true,
    });
  });

  it("does not mark blocked from recurring blockout parent range alone (needs blockout_dates)", async () => {
    const serviceTypeId = "st-1";
    const teamId = "team-1";
    const positionId = "pos-1";
    const planId = "plan-target";
    const planSortDay = "2026-04-13";

    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a1", "p1")],
      included: [
        person("p1", "Pat", "Person"),
        teamPosition(positionId, "Vocals", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPersonBlockouts.mockResolvedValue([
      recurringWeeklyBlockout(
        "b-weekly",
        "2026-01-01T00:00:00.000Z",
        "2026-12-31T23:59:59.000Z"
      ),
    ]);
    mocks.getPersonBlockoutDates.mockResolvedValue([]);
    mocks.getPersonSchedules.mockResolvedValue({
      data: [],
      included: [],
    });

    const result = await getPeopleForPosition(
      {
        serviceTypeId,
        positionId,
        teamId,
        planId,
        date: planSortDay,
      },
      dependencies
    );

    expect(result).toHaveLength(1);
    expect(mocks.getPersonBlockoutDates).toHaveBeenCalledWith(
      "p1",
      "b-weekly",
      undefined
    );
    expect(result[0]).toMatchObject({ isBlockedForDate: false });
  });

  it("marks a recurring blockout only on its generated date", async () => {
    const teamId = "team-1";
    const positionId = "pos-1";
    mocks.getPeopleForTeamPosition.mockResolvedValue({
      data: [assignment("a1", "p1")],
      included: [
        person("p1", "Pat", "Person"),
        teamPosition(positionId, "Vocals", teamId),
        team(teamId, "Band"),
      ],
    });
    mocks.getPersonBlockouts.mockResolvedValue([
      recurringWeeklyBlockout(
        "b-weekly",
        "2026-01-01T00:00:00.000Z",
        "2026-12-31T23:59:59.000Z"
      ),
    ]);
    mocks.getPersonBlockoutDates.mockResolvedValue([
      blockout(
        "d-apr-13",
        "2026-04-13T00:00:00.000Z",
        "2026-04-13T23:59:59.000Z"
      ),
    ]);
    mocks.getPersonSchedules.mockResolvedValue({ data: [], included: [] });

    const result = await getPeopleForPosition(
      {
        serviceTypeId: "st-1",
        positionId,
        teamId,
        planId: "plan-target",
        date: "2026-04-13",
      },
      dependencies
    );

    expect(result[0]).toMatchObject({ isBlockedForDate: true });
  });
});
