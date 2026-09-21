import type { SelectedPlanMatchContext } from "@worship-admin/api/use-cases/planning-center/people/types";
import {
  getRosterEntriesForPerson,
  getRosterEntriesForSlot,
  getRosterPerson,
  isDeclinedRosterStatus,
} from "@worship-admin/api/use-cases/planning-center/plan-scheduling-context";
import type {
  PlanRosterEntry,
  PlanSchedulingContext,
} from "@worship-admin/api/use-cases/planning-center/plan-scheduling-context";
import { isNonEmptyString } from "@worship-admin/planning-center-models/json";
import type {
  PersonWithAvailability,
  RawPerson,
} from "@worship-admin/planning-center-models/types";

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

export const applySelectedPlanRosterStatus = (
  person: PersonWithAvailability,
  overlay: SelectedPlanRosterOverlay,
  assignmentLabels: string[] = overlay.assignmentLabels
) => {
  person.selectedPlanAssignmentLabels = assignmentLabels;
  person.selectedPlanDeclineReason = undefined;
  if (!overlay.selectedSlotEntry) {
    return;
  }

  person.isScheduledForSelectedPlanPosition = true;
  person.isConfirmedForSelectedPlanPosition =
    overlay.selectedSlotEntry.status === "confirmed";
  person.isDeclinedForSelectedPlanPosition =
    overlay.selectedSlotEntry.status === "declined";
  person.scheduledPlanPersonId = overlay.selectedSlotEntry.planPersonId;

  if (person.isDeclinedForSelectedPlanPosition) {
    person.selectedPlanDeclineReason =
      overlay.selectedSlotEntry.declineReason ?? null;
  }
};

export const mergeAssignmentLabels = (...labelGroups: string[][]): string[] => {
  const merged = new Map<string, string>();

  for (const rawLabel of labelGroups.flat()) {
    const label = rawLabel.trim();
    if (!label) {
      continue;
    }

    merged.set(label.toLowerCase(), label);
  }

  return [...merged.values()];
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
