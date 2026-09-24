import {
  buildPlanSchedulingContext,
  isDeclinedRosterStatus,
} from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  JsonObject,
  JsonValue,
} from "@pcobooster/planning-center-models/json";
import type {
  PCRelationship,
  PCResource,
  PlanTime,
  PlanTimeType,
} from "@pcobooster/planning-center-models/types";
import { Effect, Exit } from "effect";

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
    | "invalidatePlanWindowRosters"
  >;
  catalogService: Pick<
    PlanningCenterCatalogService,
    "updateServiceTypePlanNeededPositionTime"
  >;
}

/** Every write runs to completion; the first failure is reported afterward. */
const awaitAllWrites = <Value>(
  writes: Effect.Effect<Value, PlanningCenterError>[]
): Effect.Effect<void, PlanningCenterError> =>
  Effect.forEach(writes, (write) => Effect.exit(write), {
    concurrency: "unbounded",
  }).pipe(
    Effect.flatMap((exits) => {
      const failed = exits.find(Exit.isFailure);
      return failed === undefined
        ? Effect.void
        : Effect.failCause(failed.cause);
    })
  );

export const deletePlanTime = (
  input: DeletePlanTimeInput,
  dependencies: PlanTimeDependencies
): Effect.Effect<void, PlanningCenterError> =>
  dependencies.plansService
    .deletePlanTime(input.serviceTypeId, input.planId, input.planTimeId)
    .pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
            input.planId
          );
          dependencies.peopleService.invalidatePlanWindowRosters();
        })
      )
    );

const updateIndividualTimeAssignments = (
  input: UpdatePlanTimeInput,
  dependencies: PlanTimeDependencies
): Effect.Effect<void, PlanningCenterError> =>
  Effect.gen(function* updateIndividualTimes() {
    const assignIds = input.assignedPlanPersonIds ?? [];
    const clearIds = input.clearedPlanPersonIds ?? [];
    if (assignIds.length === 0 && clearIds.length === 0) {
      return;
    }

    const response = yield* dependencies.peopleService.getPlanTeamMembers(
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

    const updates: Effect.Effect<PCResource, PlanningCenterError>[] = [];
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
    yield* awaitAllWrites(updates);
  });

const updateNeededPositionAssignments = (
  input: UpdatePlanTimeInput,
  dependencies: PlanTimeDependencies
): Effect.Effect<void, PlanningCenterError> => {
  const assignIds = input.assignedNeededPositionIds ?? [];
  const clearIds = input.clearedNeededPositionIds ?? [];
  if (assignIds.length === 0 && clearIds.length === 0) {
    return Effect.void;
  }

  const writes: Effect.Effect<PCResource, PlanningCenterError>[] = [];
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
  return awaitAllWrites(writes);
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

const invalidPlanTime = () =>
  Effect.die(new Error("Planning Center returned an invalid plan time"));

export const getPlanTimes = (
  serviceTypeId: string,
  planId: string,
  dependencies: PlanTimeDependencies
): Effect.Effect<PlanTime[], PlanningCenterError> =>
  Effect.map(
    dependencies.plansService.getPlanTimes(serviceTypeId, planId),
    (rawPlanTimes) =>
      rawPlanTimes
        .map((raw) => normalizePlanTime(raw))
        .filter((planTime): planTime is PlanTime => planTime !== null)
        .toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  );

export const updatePlanTime = (
  input: UpdatePlanTimeInput,
  dependencies: PlanTimeDependencies
): Effect.Effect<PlanTime, PlanningCenterError> =>
  Effect.gen(function* updateTime() {
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

    const rawPlanTime = yield* dependencies.plansService.updatePlanTime(
      input.serviceTypeId,
      input.planId,
      input.planTimeId,
      attributes,
      input.assignedTeamIds,
      input.assignedPositionIds
    );
    yield* updateNeededPositionAssignments(input, dependencies).pipe(
      Effect.andThen(updateIndividualTimeAssignments(input, dependencies)),
      Effect.ensuring(
        Effect.sync(() => {
          dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
            input.planId
          );
          dependencies.peopleService.invalidatePlanWindowRosters();
        })
      )
    );

    const planTime = normalizePlanTime(rawPlanTime);
    return planTime ?? (yield* invalidPlanTime());
  });

export const createPlanTime = (
  input: CreatePlanTimeInput,
  dependencies: PlanTimeDependencies
): Effect.Effect<PlanTime, PlanningCenterError> =>
  Effect.gen(function* createTime() {
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

    const rawPlanTime = yield* dependencies.plansService.createPlanTime(
      input.serviceTypeId,
      input.planId,
      attributes,
      input.assignedTeamIds,
      input.assignedPositionIds
    );
    dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
      input.planId
    );
    dependencies.peopleService.invalidatePlanWindowRosters();

    const planTime = normalizePlanTime(rawPlanTime);
    return planTime ?? (yield* invalidPlanTime());
  });
