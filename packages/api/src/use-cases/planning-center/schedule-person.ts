import { ApiError } from "@worship-admin/api/http/api-error";
import { isString } from "@worship-admin/api/json";
import { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { findIncluded } from "@worship-admin/api/planning-center/utils";
import type { PCResource } from "@worship-admin/api/types";
import { invalidateCandidateHistoryForPerson } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import type { scheduleAssignInputSchema } from "@worship-admin/contracts/schedule";
import type { z } from "zod";

export type SchedulePersonInput = z.output<typeof scheduleAssignInputSchema>;

export interface ScheduleDependencies {
  catalog: Pick<
    typeof planningCenterCatalogService,
    "getServiceTypeTeamPositionsWithTeams"
  >;
  people: Pick<
    typeof planningCenterPeopleService,
    "getPersonTeamPositionAssignments" | "createPlanPerson"
  >;
  invalidate: (personId: string) => void;
}

const defaultDependencies: ScheduleDependencies = {
  catalog: planningCenterCatalogService,
  people: planningCenterPeopleService,
  invalidate: (personId) => {
    invalidateCandidateHistoryForPerson(
      personId,
      planningCenterPeopleService.getCacheScope()
    );
  },
};

interface ScheduleTarget {
  teamName: string;
  positionName: string;
}

const resourceName = (resource: PCResource | undefined): string => {
  const name = resource?.attributes.name;
  return isString(name) ? name : "";
};

const assignmentHasPosition = (
  assignment: PCResource,
  positionId: string
): boolean => {
  const relation = assignment.relationships?.team_position?.data;
  const identifier = Array.isArray(relation) ? relation.at(0) : relation;
  return identifier?.id === positionId;
};

const getPositionTeamId = (
  position: PCResource | undefined
): string | undefined => {
  const relation = position?.relationships?.team?.data;
  return Array.isArray(relation) ? undefined : relation?.id;
};

export const resolveScheduleTarget = async (
  input: SchedulePersonInput,
  dependencies: ScheduleDependencies
): Promise<ScheduleTarget> => {
  const [{ data: positions, included }, assignments] = await Promise.all([
    dependencies.catalog.getServiceTypeTeamPositionsWithTeams(
      input.serviceTypeId
    ),
    input.oneOff
      ? null
      : dependencies.people.getPersonTeamPositionAssignments(input.personId),
  ]);
  const position = positions.find(
    (candidate) => candidate.id === input.positionId
  );
  if (
    position === undefined &&
    (!input.oneOff || input.positionName === undefined)
  ) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "Selected position was not found for this service type"
    );
  }
  const positionTeamId = getPositionTeamId(position);
  if (position !== undefined && positionTeamId !== input.teamId) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "Selected position does not belong to selected team"
    );
  }
  const team = findIncluded(included, "Team", input.teamId);
  if (position === undefined && team === undefined) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "Selected team was not found for this service type"
    );
  }
  if (!input.oneOff) {
    const assigned =
      assignments?.data.some((assignment) =>
        assignmentHasPosition(assignment, input.positionId)
      ) ?? false;
    if (!assigned) {
      throw new ApiError(
        400,
        "INVALID_REQUEST",
        "Person is not assigned to the selected team position"
      );
    }
  }
  return {
    teamName: input.teamName ?? resourceName(team),
    positionName: resourceName(position) || (input.positionName ?? ""),
  };
};

export const matchesScheduleTarget = (
  target: ScheduleTarget,
  createdPositionName: string
): boolean => {
  if (target.positionName === "" || createdPositionName === "") {
    return true;
  }
  const teamPositionName =
    target.teamName === "" ? "" : `${target.teamName} - ${target.positionName}`;
  const positionMatches =
    createdPositionName === target.positionName ||
    createdPositionName === teamPositionName ||
    createdPositionName.endsWith(` - ${target.positionName}`);
  const teamMatches =
    target.teamName === "" ||
    createdPositionName === target.positionName ||
    createdPositionName === teamPositionName ||
    createdPositionName.startsWith(`${target.teamName} - `);
  return positionMatches && teamMatches;
};

export const schedulePerson = async (
  input: SchedulePersonInput,
  dependencies: ScheduleDependencies = defaultDependencies
) => {
  const target = await resolveScheduleTarget(input, dependencies);
  const created = await dependencies.people.createPlanPerson(
    input.serviceTypeId,
    input.personId,
    input.planId,
    input.teamId,
    target.positionName
  );
  dependencies.invalidate(input.personId);
  const name = created.attributes.team_position_name;
  const createdPositionName = isString(name) ? name : "";
  return {
    id: created.id,
    target,
    createdPositionName,
    matchesTarget: matchesScheduleTarget(target, createdPositionName),
  };
};
