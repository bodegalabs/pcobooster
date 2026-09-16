import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import { invalidatePlanWindowHistory } from "@/lib/use-cases/planning-center/get-people-for-position";
import {
  createPlanTime,
  deletePlanTime,
  getPlanTimes,
  updatePlanTime,
} from "@/lib/use-cases/planning-center/plan-times";

vi.mock("@/lib/planning-center/services/catalog-service", () => ({
  planningCenterCatalogService: {
    updateServiceTypePlanNeededPositionTime: vi.fn(),
  },
}));

vi.mock("@/lib/planning-center/services/plans-service", () => ({
  planningCenterPlansService: {
    getPlanTimes: vi.fn(),
    createPlanTime: vi.fn(),
    updatePlanTime: vi.fn(),
    deletePlanTime: vi.fn(),
  },
}));

vi.mock("@/lib/planning-center/services/people-service", () => ({
  planningCenterPeopleService: {
    getPlanTeamMembers: vi.fn(),
    updatePlanPersonTimes: vi.fn(),
    invalidatePlanTimeSensitiveReadCaches: vi.fn(),
  },
}));

vi.mock("@/lib/use-cases/planning-center/get-people-for-position", () => ({
  invalidatePlanWindowHistory: vi.fn(),
}));

const plansServiceMock = planningCenterPlansService as unknown as {
  getPlanTimes: Mock<typeof planningCenterPlansService.getPlanTimes>;
  createPlanTime: Mock<typeof planningCenterPlansService.createPlanTime>;
  updatePlanTime: Mock<typeof planningCenterPlansService.updatePlanTime>;
  deletePlanTime: Mock<typeof planningCenterPlansService.deletePlanTime>;
};
const catalogServiceMock = planningCenterCatalogService as unknown as {
  updateServiceTypePlanNeededPositionTime: Mock<
    typeof planningCenterCatalogService.updateServiceTypePlanNeededPositionTime
  >;
};
const peopleServiceMock = planningCenterPeopleService as unknown as {
  getPlanTeamMembers: Mock<
    typeof planningCenterPeopleService.getPlanTeamMembers
  >;
  updatePlanPersonTimes: Mock<
    typeof planningCenterPeopleService.updatePlanPersonTimes
  >;
  invalidatePlanTimeSensitiveReadCaches: Mock<
    typeof planningCenterPeopleService.invalidatePlanTimeSensitiveReadCaches
  >;
};
const getPlanTimesMock = plansServiceMock.getPlanTimes;
const createPlanTimeMock = plansServiceMock.createPlanTime;
const updatePlanTimeMock = plansServiceMock.updatePlanTime;
const deletePlanTimeMock = plansServiceMock.deletePlanTime;
const updateServiceTypePlanNeededPositionTimeMock =
  catalogServiceMock.updateServiceTypePlanNeededPositionTime;
const getPlanTeamMembersMock = peopleServiceMock.getPlanTeamMembers;
const updatePlanPersonTimesMock = peopleServiceMock.updatePlanPersonTimes;
const invalidatePlanTimeSensitiveReadCachesMock =
  peopleServiceMock.invalidatePlanTimeSensitiveReadCaches;
const invalidatePlanWindowHistoryMock = invalidatePlanWindowHistory as Mock<
  typeof invalidatePlanWindowHistory
>;

describe("plan times use case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes and sorts plan times", async () => {
    getPlanTimesMock.mockResolvedValue([
      {
        id: "time-2",
        type: "PlanTime",
        attributes: {
          name: "Service",
          starts_at: "2026-05-24T18:00:00.000Z",
          ends_at: "2026-05-24T19:00:00.000Z",
          time_type: "service",
        },
      },
      {
        id: "time-1",
        type: "PlanTime",
        attributes: {
          name: "Rehearsal",
          starts_at: "2026-05-24T16:00:00.000Z",
          time_type: "rehearsal",
        },
        relationships: {
          assigned_teams: {
            data: [{ type: "Team", id: "team-1" }],
          },
          assigned_positions: {
            data: [{ type: "TeamPosition", id: "position-1" }],
          },
          split_team_rehearsal_assignments: {
            data: [{ type: "SplitTeamRehearsalAssignment", id: "split-1" }],
          },
        },
      },
    ]);

    const planTimes = await getPlanTimes("plan-1");

    expect(planTimes.map((planTime) => planTime.id)).toEqual([
      "time-1",
      "time-2",
    ]);
    expect(planTimes[0]).toMatchObject({
      name: "Rehearsal",
      timeType: "rehearsal",
      endsAt: null,
      assignedTeamIds: ["team-1"],
      assignedPositionIds: ["position-1"],
      splitTeamRehearsalAssignmentIds: ["split-1"],
    });
  });

  it("updates mutable attributes and invalidates time-sensitive caches", async () => {
    updatePlanTimeMock.mockResolvedValue({
      id: "time-1",
      type: "PlanTime",
      attributes: {
        name: "Updated",
        starts_at: "2026-05-24T16:30:00.000Z",
        ends_at: "2026-05-24T17:30:00.000Z",
        time_type: "service",
      },
    });

    const planTime = await updatePlanTime({
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTimeId: "time-1",
      name: "Updated",
      startsAt: "2026-05-24T16:30:00.000Z",
      endsAt: "2026-05-24T17:30:00.000Z",
      timeType: "service",
      assignedTeamIds: ["team-1", "team-2"],
    });

    expect(updatePlanTimeMock).toHaveBeenCalledWith(
      "st-1",
      "plan-1",
      "time-1",
      {
        name: "Updated",
        starts_at: "2026-05-24T16:30:00.000Z",
        ends_at: "2026-05-24T17:30:00.000Z",
        time_type: "service",
      },
      ["team-1", "team-2"],
      undefined
    );
    expect(invalidatePlanTimeSensitiveReadCachesMock).toHaveBeenCalledWith(
      "plan-1"
    );
    expect(invalidatePlanWindowHistoryMock).toHaveBeenCalled();
    expect(planTime.timeType).toBe("service");
  });

  it("creates plan times and invalidates time-sensitive caches", async () => {
    createPlanTimeMock.mockResolvedValue({
      id: "time-new",
      type: "PlanTime",
      attributes: {
        name: "New service",
        starts_at: "2026-05-24T18:00:00.000Z",
        ends_at: null,
        time_type: "service",
      },
    });

    const planTime = await createPlanTime({
      serviceTypeId: "st-1",
      planId: "plan-1",
      name: "New service",
      startsAt: "2026-05-24T18:00:00.000Z",
      endsAt: null,
      timeType: "service",
      assignedTeamIds: ["team-1"],
      assignedPositionIds: ["position-1"],
    });

    expect(createPlanTimeMock).toHaveBeenCalledWith(
      "st-1",
      "plan-1",
      {
        name: "New service",
        starts_at: "2026-05-24T18:00:00.000Z",
        ends_at: null,
        time_type: "service",
      },
      ["team-1"],
      ["position-1"]
    );
    expect(invalidatePlanTimeSensitiveReadCachesMock).toHaveBeenCalledWith(
      "plan-1"
    );
    expect(invalidatePlanWindowHistoryMock).toHaveBeenCalled();
    expect(planTime.id).toBe("time-new");
  });

  it("deletes plan times and invalidates time-sensitive caches", async () => {
    await deletePlanTime({
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTimeId: "time-1",
    });

    expect(deletePlanTimeMock).toHaveBeenCalledWith("st-1", "plan-1", "time-1");
    expect(invalidatePlanTimeSensitiveReadCachesMock).toHaveBeenCalledWith(
      "plan-1"
    );
    expect(invalidatePlanWindowHistoryMock).toHaveBeenCalled();
  });

  it("patches plan-level needed position time overrides", async () => {
    updatePlanTimeMock.mockResolvedValue({
      id: "time-1",
      type: "PlanTime",
      attributes: {
        name: "Updated",
        starts_at: "2026-05-24T16:30:00.000Z",
        time_type: "rehearsal",
      },
    });

    await updatePlanTime({
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTimeId: "time-1",
      assignedNeededPositionIds: ["needed-1"],
      clearedNeededPositionIds: ["needed-2"],
    });

    expect(updateServiceTypePlanNeededPositionTimeMock).toHaveBeenCalledWith(
      "st-1",
      "plan-1",
      "needed-1",
      "time-1"
    );
    expect(updateServiceTypePlanNeededPositionTimeMock).toHaveBeenCalledWith(
      "st-1",
      "plan-1",
      "needed-2",
      null
    );
  });

  it("patches individual plan person time overrides from roster relationships", async () => {
    updatePlanTimeMock.mockResolvedValue({
      id: "time-2",
      type: "PlanTime",
      attributes: {
        name: "Service",
        starts_at: "2026-05-24T18:00:00.000Z",
        time_type: "service",
      },
    });
    getPlanTeamMembersMock.mockResolvedValue({
      data: [
        planPerson("pp-add", "person-add", "team-1", "Vocal", "U", ["time-1"]),
        planPerson("pp-clear", "person-clear", "team-1", "Guitar", "C", [
          "time-2",
          "time-3",
        ]),
        planPerson("pp-declined", "person-declined", "team-1", "Drums", "D", [
          "time-2",
        ]),
        planPerson("pp-no-person", null, "team-1", "Keys", "U", ["time-2"]),
      ],
      included: [
        team("team-1", "Band"),
        person("person-add", "Alex", "Add"),
        person("person-clear", "Casey", "Clear"),
        person("person-declined", "Devon", "Declined"),
      ],
    });

    await updatePlanTime({
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTimeId: "time-2",
      assignedPlanPersonIds: ["pp-add"],
      clearedPlanPersonIds: ["pp-clear", "pp-declined", "pp-no-person"],
    });

    expect(getPlanTeamMembersMock).toHaveBeenCalledWith("st-1", "plan-1");
    expect(updatePlanPersonTimesMock).toHaveBeenCalledTimes(2);
    expect(updatePlanPersonTimesMock).toHaveBeenCalledWith({
      personId: "person-add",
      planPersonId: "pp-add",
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTimeIds: ["time-1", "time-2"],
    });
    expect(updatePlanPersonTimesMock).toHaveBeenCalledWith({
      personId: "person-clear",
      planPersonId: "pp-clear",
      serviceTypeId: "st-1",
      planId: "plan-1",
      planTimeIds: ["time-3"],
    });
  });
});

function planPerson(
  id: string,
  personId: string | null,
  teamId: string,
  positionName: string,
  status: string,
  timeIds: string[]
) {
  return {
    id,
    type: "PlanPerson" as const,
    attributes: {
      status,
      created_at: "2026-05-20T00:00:00.000Z",
      team_position_name: positionName,
    },
    relationships: {
      ...(personId
        ? { person: { data: { type: "Person" as const, id: personId } } }
        : {}),
      team: { data: { type: "Team" as const, id: teamId } },
      times: {
        data: timeIds.map((timeId) => ({
          type: "PlanTime" as const,
          id: timeId,
        })),
      },
      service_times: {
        data: [],
      },
    },
  };
}

function team(id: string, name: string) {
  return {
    id,
    type: "Team" as const,
    attributes: {
      name,
      sequence: 1,
      rehearsal_team: false,
      archived_at: null,
    },
  };
}

function person(id: string, firstName: string, lastName: string) {
  return {
    id,
    type: "Person" as const,
    attributes: {
      first_name: firstName,
      last_name: lastName,
      photo_url: null,
      photo_thumbnail_url: null,
      archived_at: null,
    },
  };
}
