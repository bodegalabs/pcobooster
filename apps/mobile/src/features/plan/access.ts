import { serviceTypeAbilities } from "@pcobooster/planning-center-models/access";
import type { PlanningCenterAccessSnapshot } from "@pcobooster/planning-center-models/access";

export interface RosterAccess {
  readonly canSchedule: boolean;
  readonly notice: { readonly title: string; readonly message: string } | null;
}

export const rosterAccess = (
  snapshot: PlanningCenterAccessSnapshot | undefined,
  serviceTypeId: string,
  demo: boolean
): RosterAccess => {
  if (demo) {
    return {
      canSchedule: false,
      notice: {
        title: "Read-only demo",
        message:
          "Explore freely. Scheduling changes are turned off in the demo.",
      },
    };
  }
  if (snapshot === undefined) {
    return { canSchedule: true, notice: null };
  }
  const abilities = serviceTypeAbilities(snapshot, serviceTypeId);
  const canSchedule = abilities.scheduleAllTeams || abilities.scheduleLedTeams;
  if (abilities.scheduleAllTeams) {
    return { canSchedule, notice: null };
  }
  return {
    canSchedule,
    notice: abilities.scheduleLedTeams
      ? {
          title: "You can schedule only the teams you lead",
          message:
            "Scheduling other teams in this service type needs Editor access in Planning Center.",
        }
      : {
          title: "View only",
          message: `Your Planning Center access here is ${abilities.level ?? "limited"}. Scheduling needs Scheduler (for teams you lead) or Editor.`,
        },
  };
};
