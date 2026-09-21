import {
  formatWallTimeInTimeZone,
  zonedWallTimeToUtcIso,
} from "@worship-admin/api/planning-center/org-calendar";
import type {
  PlanTime,
  PlanTimeType,
  TeamPositionGroup,
} from "@worship-admin/api/types";

export interface EditablePlanTime {
  name: string;
  timeType: PlanTimeType;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  assignedTeamIds: string[];
  assignedPositionIds: string[];
  assignedNeededPositionIds: string[];
  assignedPlanPersonIds: string[];
}

const haveSameIds = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const aSet = new Set(a);
  return b.every((id) => aSet.has(id));
};

export const isValidPlanTimeEdit = (edit: EditablePlanTime): boolean => {
  if (!edit.name.trim()) {
    return false;
  }
  if (!edit.startDate || !edit.startTime) {
    return false;
  }
  if (!edit.endTime) {
    return true;
  }

  const start = Date.parse(`${edit.startDate}T${edit.startTime}:00`);
  const end = Date.parse(`${edit.endDate}T${edit.endTime}:00`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
};

export const getInvalidPlanTimeEditMessage = (
  edit: EditablePlanTime
): string => {
  if (!edit.name.trim()) {
    return "Time name is required.";
  }
  if (!edit.startDate || !edit.startTime) {
    return "Start date and time are required.";
  }
  if (edit.endTime) {
    const start = Date.parse(`${edit.startDate}T${edit.startTime}:00`);
    const end = Date.parse(`${edit.endDate}T${edit.endTime}:00`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return "End time must be after start time.";
    }
  }
  return "Fix this time before saving.";
};

const getNeededPositionIdsForTime = (
  groups: TeamPositionGroup[] | undefined,
  planTimeId: string
): string[] => {
  const neededPositionIds: string[] = [];
  for (const group of groups ?? []) {
    for (const position of group.positions) {
      if (
        position.timeId === planTimeId &&
        position.neededPositionId !== undefined &&
        position.neededPositionId !== ""
      ) {
        neededPositionIds.push(position.neededPositionId);
      }
    }
  }
  return neededPositionIds;
};

const getPlanPersonIdsForTime = (
  groups: TeamPositionGroup[] | undefined,
  planTimeId: string
): string[] => {
  const planPersonIds: string[] = [];
  for (const group of groups ?? []) {
    for (const position of group.positions) {
      for (const person of position.filledPeople ?? []) {
        if (person.assignedTimeIds?.includes(planTimeId) === true) {
          planPersonIds.push(person.planPersonId);
        }
      }
    }
  }
  return planPersonIds;
};

export const buildEditablePlanTime = (
  planTime: PlanTime,
  timeZone: string,
  teamPositionGroups: TeamPositionGroup[] | undefined
): EditablePlanTime => {
  const starts = formatWallTimeInTimeZone(planTime.startsAt, timeZone);
  const ends = planTime.endsAt
    ? formatWallTimeInTimeZone(planTime.endsAt, timeZone)
    : null;

  return {
    name: planTime.name,
    timeType: planTime.timeType,
    startDate: starts.dateKey,
    startTime: starts.timeValue,
    endDate: ends?.dateKey ?? starts.dateKey,
    endTime: ends?.timeValue ?? "",
    assignedTeamIds: planTime.assignedTeamIds,
    assignedPositionIds: planTime.assignedPositionIds,
    assignedNeededPositionIds: getNeededPositionIdsForTime(
      teamPositionGroups,
      planTime.id
    ),
    assignedPlanPersonIds: getPlanPersonIdsForTime(
      teamPositionGroups,
      planTime.id
    ),
  };
};

export const planTimeEditHasChanges = (
  planTime: PlanTime,
  edit: EditablePlanTime,
  timeZone: string,
  teamPositionGroups: TeamPositionGroup[] | undefined
): boolean => {
  const original = buildEditablePlanTime(
    planTime,
    timeZone,
    teamPositionGroups
  );
  return (
    original.name !== edit.name ||
    original.timeType !== edit.timeType ||
    original.startDate !== edit.startDate ||
    original.startTime !== edit.startTime ||
    original.endDate !== edit.endDate ||
    original.endTime !== edit.endTime ||
    !haveSameIds(original.assignedTeamIds, edit.assignedTeamIds) ||
    !haveSameIds(original.assignedPositionIds, edit.assignedPositionIds) ||
    !haveSameIds(
      original.assignedNeededPositionIds,
      edit.assignedNeededPositionIds
    ) ||
    !haveSameIds(original.assignedPlanPersonIds, edit.assignedPlanPersonIds)
  );
};

export const buildPlanTimePatch = (
  planTime: PlanTime,
  edit: EditablePlanTime,
  timeZone: string,
  teamPositionGroups: TeamPositionGroup[] | undefined
) => {
  const originalNeededPositionIds = getNeededPositionIdsForTime(
    teamPositionGroups,
    planTime.id
  );
  const originalPlanPersonIds = getPlanPersonIdsForTime(
    teamPositionGroups,
    planTime.id
  );
  const originalNeededPositionIdSet = new Set(originalNeededPositionIds);
  const originalPlanPersonIdSet = new Set(originalPlanPersonIds);
  const editedNeededPositionIdSet = new Set(edit.assignedNeededPositionIds);
  const editedPlanPersonIdSet = new Set(edit.assignedPlanPersonIds);
  const newlyAssignedNeededPositionIds = edit.assignedNeededPositionIds.filter(
    (id) => !originalNeededPositionIdSet.has(id)
  );
  const newlyAssignedPlanPersonIds = edit.assignedPlanPersonIds.filter(
    (id) => !originalPlanPersonIdSet.has(id)
  );
  return {
    name: edit.name.trim(),
    time_type: edit.timeType,
    starts_at: zonedWallTimeToUtcIso(edit.startDate, edit.startTime, timeZone),
    ends_at: edit.endTime
      ? zonedWallTimeToUtcIso(
          edit.endDate || edit.startDate,
          edit.endTime,
          timeZone
        )
      : null,
    assigned_team_ids: edit.assignedTeamIds,
    assigned_position_ids: edit.assignedPositionIds,
    assigned_needed_position_ids: newlyAssignedNeededPositionIds,
    cleared_needed_position_ids: originalNeededPositionIds.filter(
      (id) => !editedNeededPositionIdSet.has(id)
    ),
    assigned_plan_person_ids: newlyAssignedPlanPersonIds,
    cleared_plan_person_ids: originalPlanPersonIds.filter(
      (id) => !editedPlanPersonIdSet.has(id)
    ),
  };
};

export const buildDefaultNewPlanTimeEdit = (
  planTimes: PlanTime[],
  timeZone: string
): EditablePlanTime => {
  const template = planTimes.at(-1);
  const starts = template
    ? formatWallTimeInTimeZone(template.startsAt, timeZone)
    : formatWallTimeInTimeZone(new Date(), timeZone);
  const ends = template?.endsAt
    ? formatWallTimeInTimeZone(template.endsAt, timeZone)
    : null;
  const timeType = template?.timeType ?? "service";

  return {
    name: timeType === "rehearsal" ? "New rehearsal" : "New service",
    timeType,
    startDate: starts.dateKey,
    startTime: starts.timeValue,
    endDate: ends?.dateKey ?? starts.dateKey,
    endTime: ends?.timeValue ?? "",
    assignedTeamIds: template?.assignedTeamIds ?? [],
    assignedPositionIds: template?.assignedPositionIds ?? [],
    assignedNeededPositionIds: [],
    assignedPlanPersonIds: [],
  };
};

export const buildCreatePlanTimeRequest = (
  edit: EditablePlanTime,
  timeZone: string
) => ({
  name: edit.name.trim(),
  time_type: edit.timeType,
  starts_at: zonedWallTimeToUtcIso(edit.startDate, edit.startTime, timeZone),
  ends_at: edit.endTime
    ? zonedWallTimeToUtcIso(
        edit.endDate || edit.startDate,
        edit.endTime,
        timeZone
      )
    : null,
  assigned_team_ids: edit.assignedTeamIds,
  assigned_position_ids: edit.assignedPositionIds,
});
