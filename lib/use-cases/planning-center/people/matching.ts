import type {
  PersonWithAvailability,
  RawPlanPerson,
  RawSchedule,
} from "@/lib/types";
import type { SelectedPlanMatchContext } from "@/lib/use-cases/planning-center/people/types";

type SchedulableRecord = RawSchedule | RawPlanPerson;

function parseTeamPositionName(
  teamPositionName: string | undefined
): { teamName?: string; positionName: string } | null {
  const raw = (teamPositionName || "").trim();
  if (!raw) return null;

  if (!raw.includes(" - ")) {
    return { positionName: raw };
  }

  const parts = raw.split(" - ");
  const teamName = parts[0]?.trim();
  const positionName = parts.slice(1).join(" - ").trim();
  if (!positionName) return null;

  return {
    teamName: teamName || undefined,
    positionName,
  };
}

function readScheduleTeamPositionParts(
  schedule: SchedulableRecord
): { teamName?: string; positionName: string } | null {
  const parsed = parseTeamPositionName(
    schedule.attributes.team_position_name as string | undefined
  );
  if (!parsed) return null;

  const explicitTeamName =
    typeof (schedule as RawSchedule).attributes.team_name === "string"
      ? ((schedule as RawSchedule).attributes.team_name || "").trim()
      : "";

  return {
    ...parsed,
    teamName: parsed.teamName || explicitTeamName || undefined,
  };
}

/** Planning Center Services: status `D` / "declined". Excluded from schedule history and load algorithms; matching still uses raw rows so the UI can show "Declined" for the selected plan. */
export function isDeclinedAssignmentStatus(
  status: string | undefined
): boolean {
  const s = (status || "").trim();
  const n = s.toLowerCase();
  return s === "D" || n === "declined";
}

export function findMatchingScheduleForSelectedPosition<
  T extends SchedulableRecord,
>(schedules: T[], context: SelectedPlanMatchContext): T | undefined {
  const { planId, teamId, selectedPositionName, selectedTeamName } = context;
  if (!planId || !selectedPositionName) return undefined;

  return schedules.find((schedule) => {
    const planRel = schedule.relationships?.plan?.data;
    const schedulePlanId = Array.isArray(planRel)
      ? planRel[0]?.id
      : planRel?.id;
    if (schedulePlanId !== planId) return false;

    if (teamId) {
      const teamRel = schedule.relationships?.team?.data;
      const scheduleTeamId = Array.isArray(teamRel)
        ? teamRel[0]?.id
        : teamRel?.id;
      if (scheduleTeamId && scheduleTeamId !== teamId) return false;
    }

    const parsed = readScheduleTeamPositionParts(schedule);
    if (!parsed) return false;
    if (
      selectedTeamName &&
      parsed.teamName &&
      parsed.teamName !== selectedTeamName
    )
      return false;
    return parsed.positionName === selectedPositionName;
  });
}

export function getSelectedPlanAssignmentLabels<T extends SchedulableRecord>(
  schedules: T[],
  context: SelectedPlanMatchContext
): string[] {
  const { planId } = context;
  if (!planId) return [];

  const labels = new Set<string>();

  for (const schedule of schedules) {
    const planRel = schedule.relationships?.plan?.data;
    const schedulePlanId = Array.isArray(planRel)
      ? planRel[0]?.id
      : planRel?.id;
    if (schedulePlanId !== planId) continue;

    if (
      isDeclinedAssignmentStatus(
        schedule.attributes.status as string | undefined
      )
    )
      continue;

    const parsed = readScheduleTeamPositionParts(schedule);
    if (!parsed?.positionName) continue;

    labels.add(
      parsed.teamName
        ? `${parsed.teamName} - ${parsed.positionName}`
        : parsed.positionName
    );
  }

  return [...labels];
}

export function applySelectedPlanStatus(
  person: PersonWithAvailability,
  matchedSchedule?: SchedulableRecord,
  selectedPlanAssignmentLabels: string[] = []
) {
  person.selectedPlanAssignmentLabels = selectedPlanAssignmentLabels;
  person.selectedPlanDeclineReason = undefined;
  if (!matchedSchedule) return;

  person.isScheduledForSelectedPlanPosition = true;
  const status =
    (matchedSchedule.attributes.status as string | undefined) || "";
  const normalizedStatus = status.toLowerCase();
  person.isConfirmedForSelectedPlanPosition =
    status === "C" || normalizedStatus === "confirmed";
  person.isDeclinedForSelectedPlanPosition = isDeclinedAssignmentStatus(status);

  const planPersonRel = (
    matchedSchedule.relationships as
      | { plan_person?: { data?: { id: string } | { id: string }[] | null } }
      | undefined
  )?.plan_person?.data;
  const planPersonId = Array.isArray(planPersonRel)
    ? planPersonRel[0]?.id
    : planPersonRel?.id;
  person.scheduledPlanPersonId = planPersonId || matchedSchedule.id;

  if (person.isDeclinedForSelectedPlanPosition) {
    const raw = (
      matchedSchedule.attributes as { decline_reason?: string | null }
    ).decline_reason;
    person.selectedPlanDeclineReason =
      typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  }
}
