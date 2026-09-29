import type {
  FilledPositionPerson,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import { getPlanPersonStatusValue } from "@/components/schedule/plan-person-status";

export interface PlanAssignment {
  teamId: string;
  positionId: string;
  positionName: string;
  status: "confirmed" | "scheduled";
}

/** One key per person across positions; people without a Planning Center id key by assignment. */
export const planPersonKey = (person: FilledPositionPerson): string =>
  person.personId ?? `plan-person:${person.planPersonId}`;

/** Each person's non-declined assignments on the plan, in lineup order. */
export const collectPlanAssignments = (
  groups: readonly TeamPositionGroup[]
): Map<string, PlanAssignment[]> => {
  const byPerson = new Map<string, PlanAssignment[]>();
  for (const group of groups) {
    for (const position of group.positions) {
      for (const person of position.filledPeople ?? []) {
        const status = getPlanPersonStatusValue(person);
        if (status === "declined") {
          continue;
        }
        const assignment: PlanAssignment = {
          teamId: group.teamId,
          positionId: position.id,
          positionName: position.name,
          status,
        };
        const key = planPersonKey(person);
        const existing = byPerson.get(key);
        if (existing) {
          existing.push(assignment);
        } else {
          byPerson.set(key, [assignment]);
        }
      }
    }
  }
  return byPerson;
};

/** The person's assignments on the plan other than the given position. */
export const otherPlanAssignments = (
  assignments: ReadonlyMap<string, PlanAssignment[]>,
  person: FilledPositionPerson,
  slot: { teamId: string; positionId: string }
): PlanAssignment[] =>
  (assignments.get(planPersonKey(person)) ?? []).filter(
    (assignment) =>
      assignment.teamId !== slot.teamId ||
      assignment.positionId !== slot.positionId
  );
