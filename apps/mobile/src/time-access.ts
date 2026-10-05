import type { PlanTimeType } from "@pcobooster/contracts/plan-time-schemas";

interface TimeAccess {
  canEdit: boolean;
  canSchedule: boolean;
}
export const canChangeTime = (
  access: TimeAccess,
  type: PlanTimeType
): boolean => access.canEdit || (access.canSchedule && type !== "service");

export const allowedTimeTypes = (access: TimeAccess): PlanTimeType[] => {
  const types: PlanTimeType[] = ["service", "rehearsal", "other"];
  return types.filter((type) => canChangeTime(access, type));
};

export const timeAccessNotice = (access: TimeAccess): string | null => {
  if (access.canEdit) {
    return null;
  }
  return access.canSchedule
    ? "You can change rehearsal and other times for teams you lead. Service times need Editor access in Planning Center."
    : "View only. Changing times needs Scheduler or Editor access in Planning Center.";
};
