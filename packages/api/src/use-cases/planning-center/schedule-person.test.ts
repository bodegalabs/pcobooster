import type { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import type { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { schedulePerson } from "@worship-admin/api/use-cases/planning-center/schedule-person";
import { scheduleAssignInputSchema as schedulePersonSchema } from "@worship-admin/contracts/schedule";
import type { PCResource } from "@worship-admin/planning-center-models/types";
import { describe, expect, it, vi } from "vitest";

type ScheduleDependencies = NonNullable<Parameters<typeof schedulePerson>[1]>;

const team = (id: string, name: string): PCResource => ({
  type: "Team",
  id,
  attributes: { name },
});

const position = (id: string, name: string, teamId: string): PCResource => ({
  type: "TeamPosition",
  id,
  attributes: { name },
  relationships: { team: { data: { type: "Team", id: teamId } } },
});

const assignment = (positionId: string): PCResource => ({
  type: "PersonTeamPositionAssignment",
  id: "assignment-1",
  attributes: {},
  relationships: {
    team_position: { data: { type: "TeamPosition", id: positionId } },
  },
});

const createdPlanPerson = (teamPositionName: string): PCResource => ({
  type: "PlanPerson",
  id: "plan-person-1",
  attributes: { team_position_name: teamPositionName },
});

const makeInput = (
  overrides: Partial<Parameters<typeof schedulePersonSchema.parse>[0]> = {}
) =>
  schedulePersonSchema.parse({
    serviceTypeId: "service-1",
    personId: "person-1",
    planId: "plan-1",
    teamId: "team-1",
    positionId: "position-1",
    ...overrides,
  });

const makeDependencies = (
  createdPositionName = "Band - Vocals",
  catalogResponse?: {
    data: PCResource[];
    included: PCResource[];
  }
) => {
  const resolvedCatalogResponse = catalogResponse ?? {
    data: [position("position-1", "Vocals", "team-1")],
    included: [team("team-1", "Band")],
  };
  const getServiceTypeTeamPositionsWithTeamsMock =
    vi.fn<
      typeof planningCenterCatalogService.getServiceTypeTeamPositionsWithTeams
    >();
  getServiceTypeTeamPositionsWithTeamsMock.mockResolvedValue(
    resolvedCatalogResponse
  );
  const getPersonTeamPositionAssignmentsMock =
    vi.fn<
      typeof planningCenterPeopleService.getPersonTeamPositionAssignments
    >();
  getPersonTeamPositionAssignmentsMock.mockResolvedValue({
    data: [assignment("position-1")],
    included: [],
  });
  const createPlanPersonMock =
    vi.fn<typeof planningCenterPeopleService.createPlanPerson>();
  createPlanPersonMock.mockResolvedValue(
    createdPlanPerson(createdPositionName)
  );
  const invalidateMock = vi.fn<ScheduleDependencies["invalidate"]>();

  const dependencies = {
    catalog: {
      getServiceTypeTeamPositionsWithTeams:
        getServiceTypeTeamPositionsWithTeamsMock,
    },
    people: {
      getPersonTeamPositionAssignments: getPersonTeamPositionAssignmentsMock,
      createPlanPerson: createPlanPersonMock,
    },
    invalidate: invalidateMock,
  } satisfies ScheduleDependencies;

  return {
    dependencies,
    getPersonTeamPositionAssignmentsMock,
    createPlanPersonMock,
    invalidateMock,
  };
};

describe(schedulePerson, () => {
  it("rejects an unknown position before creating a plan person", async () => {
    const { dependencies, createPlanPersonMock } = makeDependencies();

    await expect(
      schedulePerson(
        makeInput({ positionId: "missing-position" }),
        dependencies
      )
    ).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
    expect(createPlanPersonMock).not.toHaveBeenCalled();
  });

  it("rejects a position from another team before creating a plan person", async () => {
    const { dependencies, createPlanPersonMock } = makeDependencies();

    await expect(
      schedulePerson(makeInput({ teamId: "other-team" }), dependencies)
    ).rejects.toMatchObject({ status: 400, code: "INVALID_REQUEST" });
    expect(createPlanPersonMock).not.toHaveBeenCalled();
  });

  it("allows a one-off position without checking the person's assignments", async () => {
    const {
      dependencies,
      getPersonTeamPositionAssignmentsMock,
      createPlanPersonMock,
    } = makeDependencies("Keys", {
      data: [],
      included: [team("team-1", "Band")],
    });

    const result = await schedulePerson(
      makeInput({
        positionId: "custom-position",
        positionName: "Keys",
        oneOff: true,
      }),
      dependencies
    );

    expect(getPersonTeamPositionAssignmentsMock).not.toHaveBeenCalled();
    expect(createPlanPersonMock).toHaveBeenCalledWith(
      "service-1",
      "person-1",
      "plan-1",
      "team-1",
      "Keys"
    );
    expect(result.target).toStrictEqual({
      teamName: "Band",
      positionName: "Keys",
    });
  });

  it.each([
    ["matching", "Band - Vocals", true],
    ["mismatched", "Band - Drums", false],
  ])(
    "invalidates candidate history after a %s created assignment",
    async (_label, createdPositionName, matchesTarget) => {
      const { dependencies, createPlanPersonMock, invalidateMock } =
        makeDependencies(createdPositionName);

      const result = await schedulePerson(makeInput(), dependencies);

      expect(result.matchesTarget).toBe(matchesTarget);
      expect(createPlanPersonMock).toHaveBeenCalledOnce();
      expect(invalidateMock).toHaveBeenCalledWith("person-1");
    }
  );
});
