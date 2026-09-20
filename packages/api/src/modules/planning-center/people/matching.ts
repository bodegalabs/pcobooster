import type { SelectedPlanMatchContext } from "@worship-admin/api/modules/planning-center/people/types";
import {
  isNonEmptyString,
  isString,
} from "@worship-admin/planning-center-models/json";
import type {
  PersonWithAvailability,
  RawPlanPerson,
  RawSchedule,
} from "@worship-admin/planning-center-models/types";

type SchedulableRecord = RawSchedule | RawPlanPerson;

const parseTeamPositionName = (
  teamPositionName: string | undefined
): { teamName?: string; positionName: string } | null => {
  const raw = (teamPositionName ?? "").trim();
  if (!raw) {
    return null;
  }

  if (!raw.includes(" - ")) {
    return { positionName: raw };
  }

  const parts = raw.split(" - ");
  const teamName = parts[0]?.trim();
  const positionName = parts.slice(1).join(" - ").trim();
  if (!positionName) {
    return null;
  }

  return {
    teamName: teamName || undefined,
    positionName,
  };
};

const readScheduleTeamPositionParts = (
  schedule: SchedulableRecord
): { teamName?: string; positionName: string } | null => {
  const parsed = parseTeamPositionName(schedule.attributes.team_position_name);
  if (!parsed) {
    return null;
  }

  const explicitTeamName =
    schedule.type === "Schedule" && isString(schedule.attributes.team_name)
      ? schedule.attributes.team_name.trim()
      : "";

  return {
    ...parsed,
    teamName: (parsed.teamName ?? explicitTeamName) || undefined,
  };
};

/** Planning Center Services: status `D` / "declined". Excluded from schedule history and load algorithms; matching still uses raw rows so the UI can show "Declined" for the selected plan. */
export const isDeclinedAssignmentStatus = (
  status: string | undefined
): boolean => {
  const s = (status ?? "").trim();
  const n = s.toLowerCase();
  return s === "D" || n === "declined";
};

export const findMatchingScheduleForSelectedPosition = <
  T extends SchedulableRecord,
>(
  schedules: T[],
  context: SelectedPlanMatchContext
): T | undefined => {
  const { planId, teamId, selectedPositionName, selectedTeamName } = context;
  if (!isNonEmptyString(planId) || !isNonEmptyString(selectedPositionName)) {
    return undefined;
  }

  return schedules.find((schedule) => {
    const planRel = schedule.relationships?.plan?.data;
    const schedulePlanId = planRel?.id;
    if (schedulePlanId !== planId) {
      return false;
    }

    if (isNonEmptyString(teamId)) {
      const teamRel = schedule.relationships?.team?.data;
      const scheduleTeamId = teamRel?.id;
      if (isNonEmptyString(scheduleTeamId) && scheduleTeamId !== teamId) {
        return false;
      }
    }

    const parsed = readScheduleTeamPositionParts(schedule);
    if (!parsed) {
      return false;
    }
    if (
      isNonEmptyString(selectedTeamName) &&
      isNonEmptyString(parsed.teamName) &&
      parsed.teamName !== selectedTeamName
    ) {
      return false;
    }
    return parsed.positionName === selectedPositionName;
  });
};

export const getSelectedPlanAssignmentLabels = (
  schedules: SchedulableRecord[],
  context: SelectedPlanMatchContext
): string[] => {
  const { planId } = context;
  if (!isNonEmptyString(planId)) {
    return [];
  }

  const labels = new Set<string>();

  for (const schedule of schedules) {
    const planRel = schedule.relationships?.plan?.data;
    const schedulePlanId = planRel?.id;
    if (schedulePlanId !== planId) {
      continue;
    }

    if (isDeclinedAssignmentStatus(schedule.attributes.status)) {
      continue;
    }

    const parsed = readScheduleTeamPositionParts(schedule);
    if (!isNonEmptyString(parsed?.positionName)) {
      continue;
    }

    labels.add(
      isNonEmptyString(parsed.teamName)
        ? `${parsed.teamName} - ${parsed.positionName}`
        : parsed.positionName
    );
  }

  return [...labels];
};

export const applySelectedPlanStatus = (
  person: PersonWithAvailability,
  matchedSchedule?: SchedulableRecord,
  selectedPlanAssignmentLabels: string[] = []
) => {
  person.selectedPlanAssignmentLabels = selectedPlanAssignmentLabels;
  person.selectedPlanDeclineReason = undefined;
  if (!matchedSchedule) {
    return;
  }

  person.isScheduledForSelectedPlanPosition = true;
  const { status } = matchedSchedule.attributes;
  const normalizedStatus = status.toLowerCase();
  person.isConfirmedForSelectedPlanPosition =
    status === "C" || normalizedStatus === "confirmed";
  person.isDeclinedForSelectedPlanPosition = isDeclinedAssignmentStatus(status);

  const planPersonId =
    matchedSchedule.type === "Schedule"
      ? matchedSchedule.relationships?.plan_person?.data?.id
      : undefined;
  person.scheduledPlanPersonId = planPersonId ?? matchedSchedule.id;

  if (person.isDeclinedForSelectedPlanPosition) {
    const raw = matchedSchedule.attributes.decline_reason;
    person.selectedPlanDeclineReason =
      isString(raw) && raw.trim().length > 0 ? raw.trim() : null;
  }
};
