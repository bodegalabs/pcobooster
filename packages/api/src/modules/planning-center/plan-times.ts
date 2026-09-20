import {
  buildPlanSchedulingContext,
  isDeclinedRosterStatus,
} from "@worship-admin/api/modules/planning-center/plan-scheduling-context";
import type { PlanningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PlanningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import {
  isNonEmptyString,
  isString,
} from "@worship-admin/planning-center-models/json";
import type {
  JsonObject,
  JsonValue,
} from "@worship-admin/planning-center-models/json";
import type {
  PCRelationship,
  PCResource,
  PlanTime,
  PlanTimeType,
} from "@worship-admin/planning-center-models/types";

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
  readonly signal?: AbortSignal;
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

const awaitAllWrites = async <Value>(
  writes: Promise<Value>[],
  failureMessage: string
): Promise<void> => {
  const results = await Promise.allSettled(writes);
  for (const result of results) {
    if (result.status === "rejected") {
      throw result.reason instanceof Error
        ? result.reason
        : new Error(failureMessage, { cause: result.reason });
    }
  }
};

export const deletePlanTime = async (
  input: DeletePlanTimeInput,
  invalidateHistory: () => void,
  dependencies: PlanTimeDependencies
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
  await awaitAllWrites(updates, "A plan person time update failed");
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

  const writes: Promise<PCResource>[] = [];
  for (const id of assignIds) {
    writes.push(
      dependencies.catalogService.updateServiceTypePlanNeededPositionTime(
        input.serviceTypeId,
        input.planId,
        id,
        input.planTimeId
      )
    );
  }
  for (const id of clearIds) {
    writes.push(
      dependencies.catalogService.updateServiceTypePlanNeededPositionTime(
        input.serviceTypeId,
        input.planId,
        id,
        null
      )
    );
  }
  await awaitAllWrites(writes, "A needed position time update failed");
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
  dependencies: PlanTimeDependencies
): Promise<PlanTime[]> => {
  const rawPlanTimes = await dependencies.plansService.getPlanTimes(
    serviceTypeId,
    planId,
    dependencies.signal
  );
  return rawPlanTimes
    .map((raw) => normalizePlanTime(raw))
    .filter((planTime): planTime is PlanTime => planTime !== null)
    .toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
};

export const updatePlanTime = async (
  input: UpdatePlanTimeInput,
  invalidateHistory: () => void,
  dependencies: PlanTimeDependencies
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
  try {
    await updateNeededPositionAssignments(input, dependencies);
    await updateIndividualTimeAssignments(input, dependencies);
  } finally {
    dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
      input.planId
    );
    invalidateHistory();
  }

  const planTime = normalizePlanTime(rawPlanTime);
  if (!planTime) {
    throw new Error("Planning Center returned an invalid plan time");
  }
  return planTime;
};

export const createPlanTime = async (
  input: CreatePlanTimeInput,
  invalidateHistory: () => void,
  dependencies: PlanTimeDependencies
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
