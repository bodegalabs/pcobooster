import {
  getRosterEntriesForPerson,
  getRosterEntriesForSlot,
  getRosterPerson,
  isDeclinedRosterStatus,
} from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import type {
  PlanRosterEntry,
  PlanSchedulingContext,
} from "@pcobooster/api/modules/planning-center/plan-scheduling-context";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { SelectedPlanMatchContext } from "@pcobooster/planning-center-models/position-candidates";
import type { RawPerson } from "@pcobooster/planning-center-models/types";

export interface SelectedPlanRosterOverlay {
  selectedSlotEntry?: PlanRosterEntry;
  assignmentLabels: string[];
}

export const mergeAssignedAndSelectedPlanSlotPeople = ({
  assignedPeople,
  planSchedulingContext,
  selectedMatchContext,
}: {
  assignedPeople: RawPerson[];
  planSchedulingContext: PlanSchedulingContext;
  selectedMatchContext: SelectedPlanMatchContext;
}): RawPerson[] => {
  const peopleById = new Map(
    assignedPeople.map((person) => [person.id, person])
  );

  for (const entry of getRosterEntriesForSlot(
    planSchedulingContext,
    selectedMatchContext.teamId,
    selectedMatchContext.selectedPositionName
  )) {
    const { personId } = entry;
    if (!isNonEmptyString(personId) || peopleById.has(personId)) {
      continue;
    }

    const person = getRosterPerson(planSchedulingContext, personId);
    if (person) {
      peopleById.set(person.id, person);
    }
  }

  return [...peopleById.values()];
};

const findSelectedSlotEntry = (
  rosterEntries: PlanRosterEntry[],
  selectedMatchContext: SelectedPlanMatchContext
): PlanRosterEntry | undefined => {
  const { teamId, selectedPositionName, selectedTeamName } =
    selectedMatchContext;
  if (!isNonEmptyString(selectedPositionName)) {
    return undefined;
  }

  return rosterEntries.find((entry) => {
    if (
      isNonEmptyString(teamId) &&
      isNonEmptyString(entry.teamId) &&
      entry.teamId !== teamId
    ) {
      return false;
    }
    if (
      isNonEmptyString(selectedTeamName) &&
      isNonEmptyString(entry.teamName) &&
      entry.teamName !== selectedTeamName
    ) {
      return false;
    }
    return entry.positionName === selectedPositionName;
  });
};

const getPlanRosterAssignmentLabels = (
  rosterEntries: PlanRosterEntry[]
): string[] => {
  const labels: string[] = [];
  for (const entry of rosterEntries) {
    if (!isDeclinedRosterStatus(entry.status)) {
      labels.push(entry.label);
    }
  }
  return labels;
};

export const getSelectedPlanRosterOverlay = (
  planSchedulingContext: PlanSchedulingContext,
  personId: string,
  selectedMatchContext: SelectedPlanMatchContext
): SelectedPlanRosterOverlay => {
  const rosterEntries = getRosterEntriesForPerson(
    planSchedulingContext,
    personId
  );

  return {
    selectedSlotEntry: findSelectedSlotEntry(
      rosterEntries,
      selectedMatchContext
    ),
    assignmentLabels: getPlanRosterAssignmentLabels(rosterEntries),
  };
};
