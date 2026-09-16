import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import type {
  PlanTime,
  PlanTimeType,
  RawPlanPerson,
  RawPlanTime,
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

export async function getPlanTimes(planId: string): Promise<PlanTime[]> {
  const rawPlanTimes = await planningCenterPlansService.getPlanTimes(planId);
  return rawPlanTimes
    .map((raw) => normalizePlanTime(raw as RawPlanTime))
    .filter((planTime): planTime is PlanTime => planTime !== null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function updatePlanTime(
  input: UpdatePlanTimeInput
): Promise<PlanTime> {
  const attributes: Record<string, unknown> = {};
  if (input.name !== undefined) attributes.name = input.name;
  if (input.startsAt !== undefined) attributes.starts_at = input.startsAt;
  if (input.endsAt !== undefined) attributes.ends_at = input.endsAt;
  if (input.timeType !== undefined) attributes.time_type = input.timeType;

  const rawPlanTime = await planningCenterPlansService.updatePlanTime(
    input.serviceTypeId,
    input.planId,
    input.planTimeId,
    attributes,
    input.assignedTeamIds,
    input.assignedPositionIds
  );
  await updateNeededPositionAssignments(input);
  await updateIndividualTimeAssignments(input);
  planningCenterPeopleService.invalidatePlanTimeSensitiveReadCaches(
    input.planId
  );
  invalidatePlanWindowHistory();

  const planTime = normalizePlanTime(rawPlanTime as RawPlanTime);
  if (!planTime) {
    throw new Error("Planning Center returned an invalid plan time");
  }
  return planTime;
}

export async function createPlanTime(
  input: CreatePlanTimeInput
): Promise<PlanTime> {
  const attributes: Record<string, unknown> = {
    starts_at: input.startsAt,
    time_type: input.timeType,
  };
  if (input.name !== undefined) attributes.name = input.name;
  if (input.endsAt !== undefined) attributes.ends_at = input.endsAt;

  const rawPlanTime = await planningCenterPlansService.createPlanTime(
    input.serviceTypeId,
    input.planId,
    attributes,
    input.assignedTeamIds,
    input.assignedPositionIds
  );
  planningCenterPeopleService.invalidatePlanTimeSensitiveReadCaches(
    input.planId
  );
  invalidatePlanWindowHistory();

  const planTime = normalizePlanTime(rawPlanTime as RawPlanTime);
  if (!planTime) {
    throw new Error("Planning Center returned an invalid plan time");
  }
  return planTime;
}

export async function deletePlanTime(
  input: DeletePlanTimeInput
): Promise<void> {
  await planningCenterPlansService.deletePlanTime(
    input.serviceTypeId,
    input.planId,
    input.planTimeId
  );
  planningCenterPeopleService.invalidatePlanTimeSensitiveReadCaches(
    input.planId
  );
  invalidatePlanWindowHistory();
}

async function updateIndividualTimeAssignments(input: UpdatePlanTimeInput) {
  const assignIds = input.assignedPlanPersonIds ?? [];
  const clearIds = input.clearedPlanPersonIds ?? [];
  if (assignIds.length === 0 && clearIds.length === 0) return;

  const response = await planningCenterPeopleService.getPlanTeamMembers(
    input.serviceTypeId,
    input.planId
  );
  const context = buildPlanSchedulingContext({
    serviceTypeId: input.serviceTypeId,
    planId: input.planId,
    planTeamMembers: response.data as RawPlanPerson[],
    included: response.included || [],
  });
  const targetIds = new Set([...assignIds, ...clearIds]);
  const assignSet = new Set(assignIds);

  await Promise.all(
    context.rosterEntries
      .filter((entry) => targetIds.has(entry.planPersonId))
      .filter(
        (entry) => entry.personId && !isDeclinedRosterStatus(entry.status)
      )
      .map((entry) => {
        const current = new Set(entry.assignedTimeIds);
        if (assignSet.has(entry.planPersonId)) {
          current.add(input.planTimeId);
        } else {
          current.delete(input.planTimeId);
        }

        return planningCenterPeopleService.updatePlanPersonTimes({
          personId: entry.personId!,
          planPersonId: entry.planPersonId,
          serviceTypeId: input.serviceTypeId,
          planId: input.planId,
          planTimeIds: [...current],
        });
      })
  );
}

async function updateNeededPositionAssignments(input: UpdatePlanTimeInput) {
  const assignIds = input.assignedNeededPositionIds ?? [];
  const clearIds = input.clearedNeededPositionIds ?? [];
  if (assignIds.length === 0 && clearIds.length === 0) return;

  await Promise.all([
    ...assignIds.map((id) =>
      planningCenterCatalogService.updateServiceTypePlanNeededPositionTime(
        input.serviceTypeId,
        input.planId,
        id,
        input.planTimeId
      )
    ),
    ...clearIds.map((id) =>
      planningCenterCatalogService.updateServiceTypePlanNeededPositionTime(
        input.serviceTypeId,
        input.planId,
        id,
        null
      )
    ),
  ]);
}

function normalizePlanTime(raw: RawPlanTime): PlanTime | null {
  const startsAt = parseRequiredDate(raw.attributes.starts_at);
  if (!startsAt) return null;

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
}

function getRelationshipIds(
  relationships: { id: string }[] | undefined
): string[] {
  return relationships?.map((relationship) => relationship.id) ?? [];
}

function normalizeName(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || "Untitled time";
}

function normalizeTimeType(value: string | undefined): PlanTimeType {
  if (value === "rehearsal" || value === "service" || value === "other") {
    return value;
  }
  return "other";
}

function parseRequiredDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
