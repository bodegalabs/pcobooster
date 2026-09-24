import { isString } from "@pcobooster/planning-center-models/json";
import type { SelectedPlanAssignment } from "@pcobooster/planning-center-models/position-candidates";
import type {
  RawPlanPerson,
  RawSchedule,
} from "@pcobooster/planning-center-models/types";

/** The fields of a roster row or schedule that selected-plan matching reads. */
export const toSelectedPlanAssignment = (
  record: RawPlanPerson | RawSchedule
): SelectedPlanAssignment => {
  const declineReason = record.attributes.decline_reason;
  const isSchedule = record.type === "Schedule";
  const teamName = isSchedule ? record.attributes.team_name : undefined;
  const planPersonId = isSchedule
    ? record.relationships?.plan_person?.data?.id
    : undefined;
  return {
    source: isSchedule ? "schedule" : "planPerson",
    id: record.id,
    planId: record.relationships?.plan?.data?.id ?? null,
    teamId: record.relationships?.team?.data?.id ?? null,
    teamName: isString(teamName) ? teamName : null,
    teamPositionName: record.attributes.team_position_name ?? "",
    status: record.attributes.status,
    planPersonId: planPersonId ?? null,
    declineReason:
      isString(declineReason) && declineReason.trim().length > 0
        ? declineReason.trim()
        : null,
  };
};

/** The records on the selected plan, in their original order. */
export const selectedPlanAssignmentsFor = (
  records: readonly (RawPlanPerson | RawSchedule)[],
  planId: string
): SelectedPlanAssignment[] =>
  records.flatMap((record) =>
    record.relationships?.plan?.data?.id === planId
      ? [toSelectedPlanAssignment(record)]
      : []
  );
