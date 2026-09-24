import {
  matchesScheduleTarget,
  resolveScheduleTarget,
} from "@pcobooster/api/modules/planning-center/schedule-person";
import type { ScheduleDependencies } from "@pcobooster/api/modules/planning-center/schedule-person";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { scheduleAssignInputSchema as schedulePersonSchema } from "@pcobooster/contracts/schedule";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

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

const makeDependencies = (catalogResponse?: {
  data: PCResource[];
  included: PCResource[];
}) => {
  const resolvedCatalogResponse = catalogResponse ?? {
    data: [position("position-1", "Vocals", "team-1")],
    included: [team("team-1", "Band")],
  };
  const getServiceTypeTeamPositionsWithTeamsMock =
    vi.fn<
      PlanningCenterCatalogService["getServiceTypeTeamPositionsWithTeams"]
    >();
  getServiceTypeTeamPositionsWithTeamsMock.mockReturnValue(
    Effect.succeed(resolvedCatalogResponse)
  );
  const getPersonTeamPositionAssignmentsMock =
    vi.fn<PlanningCenterPeopleService["getPersonTeamPositionAssignments"]>();
  getPersonTeamPositionAssignmentsMock.mockReturnValue(
    Effect.succeed({
      data: [assignment("position-1")],
      included: [],
    })
  );
  const dependencies = {
    catalog: {
      getServiceTypeTeamPositionsWithTeams:
        getServiceTypeTeamPositionsWithTeamsMock,
    },
    people: {
      getPersonTeamPositionAssignments: getPersonTeamPositionAssignmentsMock,
    },
  } satisfies ScheduleDependencies;

  return {
    dependencies,
    getPersonTeamPositionAssignmentsMock,
  };
};

describe(resolveScheduleTarget, () => {
  it("rejects an unknown position", async () => {
    const { dependencies } = makeDependencies();

    await expect(
      Effect.runPromise(
        Effect.flip(
          resolveScheduleTarget(
            makeInput({ positionId: "missing-position" }),
            dependencies
          )
        )
      )
    ).resolves.toMatchObject({ _tag: "InvalidInput" });
  });

  it("rejects a position from another team", async () => {
    const { dependencies } = makeDependencies();

    await expect(
      Effect.runPromise(
        Effect.flip(
          resolveScheduleTarget(
            makeInput({ teamId: "other-team" }),
            dependencies
          )
        )
      )
    ).resolves.toMatchObject({ _tag: "InvalidInput" });
  });

  it("allows a one-off position without checking the person's assignments", async () => {
    const { dependencies, getPersonTeamPositionAssignmentsMock } =
      makeDependencies({
        data: [],
        included: [team("team-1", "Band")],
      });

    const target = await Effect.runPromise(
      resolveScheduleTarget(
        makeInput({
          positionId: "custom-position",
          positionName: "Keys",
          oneOff: true,
        }),
        dependencies
      )
    );

    expect(getPersonTeamPositionAssignmentsMock).not.toHaveBeenCalled();
    expect(target).toStrictEqual({
      teamName: "Band",
      positionName: "Keys",
    });
  });
});

describe(matchesScheduleTarget, () => {
  it.each([
    ["matching", "Band - Vocals", true],
    ["mismatched", "Band - Drums", false],
  ])(
    "recognizes a %s provider result",
    (_label, createdPositionName, matchesTarget) => {
      expect(
        matchesScheduleTarget(
          { teamName: "Band", positionName: "Vocals" },
          createdPositionName
        )
      ).toBe(matchesTarget);
    }
  );
});
