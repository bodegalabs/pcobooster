import type { planTimesUpdateInputSchema } from "@pcobooster/contracts/http/plan-times";
import type { EditablePlanTime } from "@pcobooster/planning-center-models/plan-time-edits";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";

export type TimeAssignments = Pick<
  EditablePlanTime,
  "assignedNeededPositionIds" | "assignedPlanPersonIds"
>;
type AssignmentPatch = Pick<
  typeof planTimesUpdateInputSchema.Type,
  | "planTimeId"
  | "timeType"
  | "assignedNeededPositionIds"
  | "clearedNeededPositionIds"
  | "assignedPlanPersonIds"
  | "clearedPlanPersonIds"
>;

/** Time and roster writes transform the same acknowledged roster and pending journal. */
export const applyTimeAssignments = (
  groups: TeamPositionGroup[],
  patch: AssignmentPatch
): TeamPositionGroup[] => {
  const assignedSlots = new Set(patch.assignedNeededPositionIds);
  const clearedSlots = new Set(patch.clearedNeededPositionIds);
  const assignedPeople = new Set(patch.assignedPlanPersonIds);
  const clearedPeople = new Set(patch.clearedPlanPersonIds);
  return groups.map((group) => ({
    ...group,
    positions: group.positions.map((position) => {
      let { timeId } = position;
      if (position.neededPositionId !== undefined) {
        if (assignedSlots.has(position.neededPositionId)) {
          timeId = patch.planTimeId;
        } else if (
          timeId === patch.planTimeId &&
          clearedSlots.has(position.neededPositionId)
        ) {
          timeId = undefined;
        }
      }
      return {
        ...position,
        timeId,
        filledPeople: position.filledPeople?.map((person) => {
          const times = person.assignedTimeIds ?? [];
          if (assignedPeople.has(person.planPersonId)) {
            return {
              ...person,
              assignedTimeIds: [...new Set([...times, patch.planTimeId])],
              serviceTimeIds:
                patch.timeType === "service"
                  ? [
                      ...new Set([
                        ...(person.serviceTimeIds ?? []),
                        patch.planTimeId,
                      ]),
                    ]
                  : person.serviceTimeIds,
            };
          }
          if (clearedPeople.has(person.planPersonId)) {
            return {
              ...person,
              assignedTimeIds: times.filter((id) => id !== patch.planTimeId),
              serviceTimeIds: person.serviceTimeIds?.filter(
                (id) => id !== patch.planTimeId
              ),
            };
          }
          return person;
        }),
      };
    }),
  }));
};

export const replaceTimeAssignments = (
  groups: TeamPositionGroup[],
  planTimeId: string,
  assignments: TimeAssignments,
  timeType?: AssignmentPatch["timeType"]
): TeamPositionGroup[] => {
  const slots = new Set(assignments.assignedNeededPositionIds);
  const people = new Set(assignments.assignedPlanPersonIds);
  const clearedNeededPositionIds: string[] = [];
  const clearedPlanPersonIds: string[] = [];
  for (const group of groups) {
    for (const position of group.positions) {
      if (
        position.timeId === planTimeId &&
        position.neededPositionId !== undefined &&
        !slots.has(position.neededPositionId)
      ) {
        clearedNeededPositionIds.push(position.neededPositionId);
      }
      for (const person of position.filledPeople ?? []) {
        if (
          person.assignedTimeIds?.includes(planTimeId) === true &&
          !people.has(person.planPersonId)
        ) {
          clearedPlanPersonIds.push(person.planPersonId);
        }
      }
    }
  }
  return applyTimeAssignments(groups, {
    planTimeId,
    timeType,
    ...assignments,
    clearedNeededPositionIds,
    clearedPlanPersonIds,
  });
};
