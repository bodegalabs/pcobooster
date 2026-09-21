import {
  createPlanTime,
  deletePlanTime,
  getPlanTimes,
  updatePlanTime,
} from "@worship-admin/api/use-cases/planning-center/plan-times";
import type { PlanTimeDependencies } from "@worship-admin/api/use-cases/planning-center/plan-times";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createFixture = () => {
  const getPlanTimesMock =
    vi.fn<PlanTimeDependencies["plansService"]["getPlanTimes"]>();
  const createPlanTimeMock =
    vi.fn<PlanTimeDependencies["plansService"]["createPlanTime"]>();
  const updatePlanTimeMock =
    vi.fn<PlanTimeDependencies["plansService"]["updatePlanTime"]>();
  const deletePlanTimeMock = vi
    .fn<PlanTimeDependencies["plansService"]["deletePlanTime"]>()
    .mockResolvedValue();
  const updateServiceTypePlanNeededPositionTimeMock = vi
    .fn<
      PlanTimeDependencies["catalogService"]["updateServiceTypePlanNeededPositionTime"]
    >()
    .mockResolvedValue({
      id: "needed-1",
      type: "NeededPosition",
      attributes: {},
    });
  const getPlanTeamMembersMock =
    vi.fn<PlanTimeDependencies["peopleService"]["getPlanTeamMembers"]>();
  const updatePlanPersonTimesMock = vi
    .fn<PlanTimeDependencies["peopleService"]["updatePlanPersonTimes"]>()
    .mockResolvedValue({ id: "pp-1", type: "PlanPerson", attributes: {} });
  const invalidatePlanTimeSensitiveReadCachesMock =
    vi.fn<
      PlanTimeDependencies["peopleService"]["invalidatePlanTimeSensitiveReadCaches"]
    >();
  const invalidatePlanWindowHistoryMock = vi.fn<() => void>();
  const dependencies = {
    plansService: {
      getPlanTimes: getPlanTimesMock,
      createPlanTime: createPlanTimeMock,
      updatePlanTime: updatePlanTimeMock,
      deletePlanTime: deletePlanTimeMock,
    },
    peopleService: {
      getPlanTeamMembers: getPlanTeamMembersMock,
      updatePlanPersonTimes: updatePlanPersonTimesMock,
      invalidatePlanTimeSensitiveReadCaches:
        invalidatePlanTimeSensitiveReadCachesMock,
    },
    catalogService: {
      updateServiceTypePlanNeededPositionTime:
        updateServiceTypePlanNeededPositionTimeMock,
    },
  } satisfies PlanTimeDependencies;
  return {
    getPlanTimesMock,
    createPlanTimeMock,
    updatePlanTimeMock,
    deletePlanTimeMock,
    updateServiceTypePlanNeededPositionTimeMock,
    getPlanTeamMembersMock,
    updatePlanPersonTimesMock,
    invalidatePlanTimeSensitiveReadCachesMock,
    invalidatePlanWindowHistoryMock,
    dependencies,
  };
};

const planPerson = (
  id: string,
  personId: string | null,
  teamId: string,
  positionName: string,
  status: string,
  timeIds: string[]
) => ({
  id,
  type: "PlanPerson" as const,
  attributes: {
    status,
    created_at: "2026-05-20T00:00:00.000Z",
    team_position_name: positionName,
  },
  relationships: {
    ...(isNonEmptyString(personId)
      ? { person: { data: { type: "Person" as const, id: personId } } }
      : undefined),
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
});

const team = (id: string, name: string) => ({
  id,
  type: "Team" as const,
  attributes: {
    name,
    sequence: 1,
    rehearsal_team: false,
    archived_at: null,
  },
});

const person = (id: string, firstName: string, lastName: string) => ({
  id,
  type: "Person" as const,
  attributes: {
    first_name: firstName,
    last_name: lastName,
    photo_url: null,
    photo_thumbnail_url: null,
    archived_at: null,
  },
});

describe("plan times use case", () => {
  let getPlanTimesMock: ReturnType<typeof createFixture>["getPlanTimesMock"];
  let createPlanTimeMock: ReturnType<
    typeof createFixture
  >["createPlanTimeMock"];
  let updatePlanTimeMock: ReturnType<
    typeof createFixture
  >["updatePlanTimeMock"];
  let deletePlanTimeMock: ReturnType<
    typeof createFixture
  >["deletePlanTimeMock"];
  let updateServiceTypePlanNeededPositionTimeMock: ReturnType<
    typeof createFixture
  >["updateServiceTypePlanNeededPositionTimeMock"];
  let getPlanTeamMembersMock: ReturnType<
    typeof createFixture
  >["getPlanTeamMembersMock"];
  let updatePlanPersonTimesMock: ReturnType<
    typeof createFixture
  >["updatePlanPersonTimesMock"];
  let invalidatePlanTimeSensitiveReadCachesMock: ReturnType<
    typeof createFixture
  >["invalidatePlanTimeSensitiveReadCachesMock"];
  let invalidatePlanWindowHistoryMock: ReturnType<
    typeof createFixture
  >["invalidatePlanWindowHistoryMock"];
  let dependencies: ReturnType<typeof createFixture>["dependencies"];

  beforeEach(() => {
    ({
      getPlanTimesMock,
      createPlanTimeMock,
      updatePlanTimeMock,
      deletePlanTimeMock,
      updateServiceTypePlanNeededPositionTimeMock,
      getPlanTeamMembersMock,
      updatePlanPersonTimesMock,
      invalidatePlanTimeSensitiveReadCachesMock,
      invalidatePlanWindowHistoryMock,
      dependencies,
    } = createFixture());
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

    const planTimes = await getPlanTimes("st-1", "plan-1", dependencies);

    expect(planTimes.map((planTime) => planTime.id)).toStrictEqual([
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

    const planTime = await updatePlanTime(
      {
        serviceTypeId: "st-1",
        planId: "plan-1",
        planTimeId: "time-1",
        name: "Updated",
        startsAt: "2026-05-24T16:30:00.000Z",
        endsAt: "2026-05-24T17:30:00.000Z",
        timeType: "service",
        assignedTeamIds: ["team-1", "team-2"],
      },
      invalidatePlanWindowHistoryMock,
      dependencies
    );

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
    expect(invalidatePlanWindowHistoryMock).toHaveBeenCalledWith();
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

    const planTime = await createPlanTime(
      {
        serviceTypeId: "st-1",
        planId: "plan-1",
        name: "New service",
        startsAt: "2026-05-24T18:00:00.000Z",
        endsAt: null,
        timeType: "service",
        assignedTeamIds: ["team-1"],
        assignedPositionIds: ["position-1"],
      },
      invalidatePlanWindowHistoryMock,
      dependencies
    );

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
    expect(invalidatePlanWindowHistoryMock).toHaveBeenCalledWith();
    expect(planTime.id).toBe("time-new");
  });

  it("deletes plan times and invalidates time-sensitive caches", async () => {
    await deletePlanTime(
      {
        serviceTypeId: "st-1",
        planId: "plan-1",
        planTimeId: "time-1",
      },
      invalidatePlanWindowHistoryMock,
      dependencies
    );

    expect(deletePlanTimeMock).toHaveBeenCalledWith("st-1", "plan-1", "time-1");
    expect(invalidatePlanTimeSensitiveReadCachesMock).toHaveBeenCalledWith(
      "plan-1"
    );
    expect(invalidatePlanWindowHistoryMock).toHaveBeenCalledWith();
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

    await updatePlanTime(
      {
        serviceTypeId: "st-1",
        planId: "plan-1",
        planTimeId: "time-1",
        assignedNeededPositionIds: ["needed-1"],
        clearedNeededPositionIds: ["needed-2"],
      },
      invalidatePlanWindowHistoryMock,
      dependencies
    );

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

  it("waits for sibling writes before invalidating after a partial failure", async () => {
    updatePlanTimeMock.mockResolvedValue({
      id: "time-1",
      type: "PlanTime",
      attributes: {
        name: "Updated",
        starts_at: "2026-05-24T16:30:00.000Z",
        time_type: "rehearsal",
      },
    });
    const lateWrite = Promise.withResolvers<{
      id: string;
      type: string;
      attributes: Record<string, never>;
    }>();
    updateServiceTypePlanNeededPositionTimeMock
      .mockRejectedValueOnce(new Error("assignment failed"))
      .mockImplementationOnce(async () => await lateWrite.promise);

    const update = updatePlanTime(
      {
        serviceTypeId: "st-1",
        planId: "plan-1",
        planTimeId: "time-1",
        assignedNeededPositionIds: ["needed-1", "needed-2"],
      },
      invalidatePlanWindowHistoryMock,
      dependencies
    );
    await vi.waitFor(() => {
      expect(updateServiceTypePlanNeededPositionTimeMock).toHaveBeenCalledTimes(
        2
      );
    });
    expect(invalidatePlanTimeSensitiveReadCachesMock).not.toHaveBeenCalled();
    expect(invalidatePlanWindowHistoryMock).not.toHaveBeenCalled();

    lateWrite.resolve({
      id: "needed-2",
      type: "NeededPosition",
      attributes: {},
    });

    await expect(update).rejects.toThrow("assignment failed");

    expect(invalidatePlanTimeSensitiveReadCachesMock).toHaveBeenCalledWith(
      "plan-1"
    );
    expect(invalidatePlanWindowHistoryMock).toHaveBeenCalledOnce();
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

    await updatePlanTime(
      {
        serviceTypeId: "st-1",
        planId: "plan-1",
        planTimeId: "time-2",
        assignedPlanPersonIds: ["pp-add"],
        clearedPlanPersonIds: ["pp-clear", "pp-declined", "pp-no-person"],
      },
      invalidatePlanWindowHistoryMock,
      dependencies
    );

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
