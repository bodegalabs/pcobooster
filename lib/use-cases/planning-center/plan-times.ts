import { isNonEmptyString, isString } from "@/lib/json";
import type { JsonObject, JsonValue } from "@/lib/json";
import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import type { PlanningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import type { PlanningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import type {
  PCRelationship,
  PCResource,
  PlanTime,
  PlanTimeType,
} from "@/lib/types";
import { invalidatePlanWindowHistory } from "@/lib/use-cases/planning-center/get-people-for-position";
import {
  buildPlanSchedulingContext,
  isDeclinedRosterStatus,
} from "@/lib/use-cases/planning-center/plan-scheduling-context";

interface UpdatePlanTimeInput {
  serviceTypeId: string;
  planId: string;
  planTimeId: string;
  name?: string;
  startsAt?: string;
  endsAt?: string | null;
  timeType?: PlanTimeType;
  assignedTeamIds?: string[];
  assignedPositionIds?: string[];
  assignedNeededPositionIds?: string[];
  clearedNeededPositionIds?: string[];
  assignedPlanPersonIds?: string[];
  clearedPlanPersonIds?: string[];
}

interface CreatePlanTimeInput {
  serviceTypeId: string;
  planId: string;
  name?: string;
  startsAt: string;
  endsAt?: string | null;
  timeType: PlanTimeType;
  assignedTeamIds?: string[];
  assignedPositionIds?: string[];
}

interface DeletePlanTimeInput {
  serviceTypeId: string;
  planId: string;
  planTimeId: string;
}

export interface PlanTimeDependencies {
  plansService: Pick<
    PlanningCenterPlansService,
    "getPlanTimes" | "createPlanTime" | "updatePlanTime" | "deletePlanTime"
  >;
  peopleService: Pick<
    PlanningCenterPeopleService,
    | "getPlanTeamMembers"
    | "updatePlanPersonTimes"
    | "invalidatePlanTimeSensitiveReadCaches"
  >;
  catalogService: Pick<
    PlanningCenterCatalogService,
    "updateServiceTypePlanNeededPositionTime"
  >;
}

const defaultDependencies: PlanTimeDependencies = {
  plansService: planningCenterPlansService,
  peopleService: planningCenterPeopleService,
  catalogService: planningCenterCatalogService,
};

export const deletePlanTime = async (
  input: DeletePlanTimeInput,
  invalidateHistory: () => void = invalidatePlanWindowHistory,
  dependencies: PlanTimeDependencies = defaultDependencies
): Promise<void> => {
  await dependencies.plansService.deletePlanTime(
    input.serviceTypeId,
    input.planId,
    input.planTimeId
  );
  dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
    input.planId
  );
  invalidateHistory();
};

const updateIndividualTimeAssignments = async (
  input: UpdatePlanTimeInput,
  dependencies: PlanTimeDependencies
) => {
  const assignIds = input.assignedPlanPersonIds ?? [];
  const clearIds = input.clearedPlanPersonIds ?? [];
  if (assignIds.length === 0 && clearIds.length === 0) {
    return;
  }

  const response = await dependencies.peopleService.getPlanTeamMembers(
    input.serviceTypeId,
    input.planId
  );
  const context = buildPlanSchedulingContext({
    serviceTypeId: input.serviceTypeId,
    planId: input.planId,
    planTeamMembers: response.data,
    included: response.included ?? [],
  });
  const targetIds = new Set([...assignIds, ...clearIds]);
  const assignSet = new Set(assignIds);

  const updates: Promise<PCResource>[] = [];
  for (const entry of context.rosterEntries) {
    if (
      !targetIds.has(entry.planPersonId) ||
      !isNonEmptyString(entry.personId) ||
      isDeclinedRosterStatus(entry.status)
    ) {
      continue;
    }
    const current = new Set(entry.assignedTimeIds);
    if (assignSet.has(entry.planPersonId)) {
      current.add(input.planTimeId);
    } else {
      current.delete(input.planTimeId);
    }
    updates.push(
      dependencies.peopleService.updatePlanPersonTimes({
        personId: entry.personId,
        planPersonId: entry.planPersonId,
        serviceTypeId: input.serviceTypeId,
        planId: input.planId,
        planTimeIds: [...current],
      })
    );
  }
  await Promise.all(updates);
};

const updateNeededPositionAssignments = async (
  input: UpdatePlanTimeInput,
  dependencies: PlanTimeDependencies
) => {
  const assignIds = input.assignedNeededPositionIds ?? [];
  const clearIds = input.clearedNeededPositionIds ?? [];
  if (assignIds.length === 0 && clearIds.length === 0) {
    return;
  }

  await Promise.all([
    ...assignIds.map(
      async (id) =>
        await dependencies.catalogService.updateServiceTypePlanNeededPositionTime(
          input.serviceTypeId,
          input.planId,
          id,
          input.planTimeId
        )
    ),
    ...clearIds.map(
      async (id) =>
        await dependencies.catalogService.updateServiceTypePlanNeededPositionTime(
          input.serviceTypeId,
          input.planId,
          id,
          null
        )
    ),
  ]);
};

const getRelationshipIds = (data: PCRelationship["data"]): string[] => {
  if (data === undefined || data === null) {
    return [];
  }
  return Array.isArray(data) ? data.map((related) => related.id) : [data.id];
};

const normalizeName = (value: JsonValue | undefined): string => {
  if (!isString(value)) {
    return "Untitled time";
  }
  return value.trim();
};

const normalizeTimeType = (value: JsonValue | undefined): PlanTimeType => {
  if (value === "rehearsal" || value === "service" || value === "other") {
    return value;
  }
  return "other";
};

const parseRequiredDate = (value: JsonValue | undefined): Date | null => {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseOptionalDate = (value: JsonValue | undefined): Date | null => {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizePlanTime = (raw: PCResource): PlanTime | null => {
  const startsAt = parseRequiredDate(raw.attributes.starts_at);
  if (!startsAt) {
    return null;
  }

  return {
    id: raw.id,
    name: normalizeName(raw.attributes.name),
    startsAt,
    endsAt: parseOptionalDate(raw.attributes.ends_at),
    timeType: normalizeTimeType(raw.attributes.time_type),
    teamReminders: raw.attributes.team_reminders ?? null,
    assignedTeamIds: getRelationshipIds(
      raw.relationships?.assigned_teams?.data
    ),
    assignedPositionIds: getRelationshipIds(
      raw.relationships?.assigned_positions?.data
    ),
    splitTeamRehearsalAssignmentIds: getRelationshipIds(
      raw.relationships?.split_team_rehearsal_assignments?.data
    ),
  };
};

export const getPlanTimes = async (
  serviceTypeId: string,
  planId: string,
  dependencies: PlanTimeDependencies = defaultDependencies
): Promise<PlanTime[]> => {
  const rawPlanTimes = await dependencies.plansService.getPlanTimes(
    serviceTypeId,
    planId
  );
  return rawPlanTimes
    .map((raw) => normalizePlanTime(raw))
    .filter((planTime): planTime is PlanTime => planTime !== null)
    .toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
};

export const updatePlanTime = async (
  input: UpdatePlanTimeInput,
  invalidateHistory: () => void = invalidatePlanWindowHistory,
  dependencies: PlanTimeDependencies = defaultDependencies
): Promise<PlanTime> => {
  const attributes: JsonObject = {};
  if (input.name !== undefined) {
    attributes.name = input.name;
  }
  if (input.startsAt !== undefined) {
    attributes.starts_at = input.startsAt;
  }
  if (input.endsAt !== undefined) {
    attributes.ends_at = input.endsAt;
  }
  if (input.timeType !== undefined) {
    attributes.time_type = input.timeType;
  }

  const rawPlanTime = await dependencies.plansService.updatePlanTime(
    input.serviceTypeId,
    input.planId,
    input.planTimeId,
    attributes,
    input.assignedTeamIds,
    input.assignedPositionIds
  );
  await updateNeededPositionAssignments(input, dependencies);
  await updateIndividualTimeAssignments(input, dependencies);
  dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
    input.planId
  );
  invalidateHistory();

  const planTime = normalizePlanTime(rawPlanTime);
  if (!planTime) {
    throw new Error("Planning Center returned an invalid plan time");
  }
  return planTime;
};

export const createPlanTime = async (
  input: CreatePlanTimeInput,
  invalidateHistory: () => void = invalidatePlanWindowHistory,
  dependencies: PlanTimeDependencies = defaultDependencies
): Promise<PlanTime> => {
  const attributes: JsonObject = {
    starts_at: input.startsAt,
    time_type: input.timeType,
  };
  if (input.name !== undefined) {
    attributes.name = input.name;
  }
  if (input.endsAt !== undefined) {
    attributes.ends_at = input.endsAt;
  }

  const rawPlanTime = await dependencies.plansService.createPlanTime(
    input.serviceTypeId,
    input.planId,
    attributes,
    input.assignedTeamIds,
    input.assignedPositionIds
  );
  dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
    input.planId
  );
  invalidateHistory();

  const planTime = normalizePlanTime(rawPlanTime);
  if (!planTime) {
    throw new Error("Planning Center returned an invalid plan time");
  }
  return planTime;
};
