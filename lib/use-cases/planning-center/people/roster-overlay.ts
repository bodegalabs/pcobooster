import type { PersonWithAvailability, RawPerson } from "@/lib/types";
import type { SelectedPlanMatchContext } from "@/lib/use-cases/planning-center/people/types";
import {
  getRosterEntriesForPerson,
  getRosterEntriesForSlot,
  getRosterPerson,
  isDeclinedRosterStatus,
  type PlanRosterEntry,
  type PlanSchedulingContext,
} from "@/lib/use-cases/planning-center/plan-scheduling-context";

export interface SelectedPlanRosterOverlay {
  selectedSlotEntry?: PlanRosterEntry;
  assignmentLabels: string[];
}

export function mergeAssignedAndSelectedPlanSlotPeople({
  assignedPeople,
  planSchedulingContext,
  selectedMatchContext,
}: {
  assignedPeople: RawPerson[];
  planSchedulingContext: PlanSchedulingContext;
  selectedMatchContext: SelectedPlanMatchContext;
}): RawPerson[] {
  const peopleById = new Map(
    assignedPeople.map((person) => [person.id, person])
  );

  for (const entry of getRosterEntriesForSlot(
    planSchedulingContext,
    selectedMatchContext.teamId,
    selectedMatchContext.selectedPositionName
  )) {
    const personId = entry.personId;
    if (!personId || peopleById.has(personId)) continue;

    const person = getRosterPerson(planSchedulingContext, personId);
    if (person) {
      peopleById.set(person.id, person);
    }
  }

  return [...peopleById.values()];
}

export function getSelectedPlanRosterOverlay(
  planSchedulingContext: PlanSchedulingContext,
  personId: string,
  selectedMatchContext: SelectedPlanMatchContext
): SelectedPlanRosterOverlay {
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
}

export function applySelectedPlanRosterStatus(
  person: PersonWithAvailability,
  overlay: SelectedPlanRosterOverlay,
  assignmentLabels: string[] = overlay.assignmentLabels
) {
  person.selectedPlanAssignmentLabels = assignmentLabels;
  person.selectedPlanDeclineReason = undefined;
  if (!overlay.selectedSlotEntry) return;

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
}

export function mergeAssignmentLabels(...labelGroups: string[][]): string[] {
  const merged = new Map<string, string>();

  for (const rawLabel of labelGroups.flat()) {
    const label = rawLabel.trim();
    if (!label) continue;

    merged.set(label.toLowerCase(), label);
  }

  return [...merged.values()];
}

function findSelectedSlotEntry(
  rosterEntries: PlanRosterEntry[],
  selectedMatchContext: SelectedPlanMatchContext
): PlanRosterEntry | undefined {
  const { teamId, selectedPositionName, selectedTeamName } =
    selectedMatchContext;
  if (!selectedPositionName) return undefined;

  return rosterEntries.find((entry) => {
    if (teamId && entry.teamId && entry.teamId !== teamId) return false;
    if (
      selectedTeamName &&
      entry.teamName &&
      entry.teamName !== selectedTeamName
    ) {
      return false;
    }
    return entry.positionName === selectedPositionName;
  });
}

function getPlanRosterAssignmentLabels(
  rosterEntries: PlanRosterEntry[]
): string[] {
  return rosterEntries
    .filter((entry) => !isDeclinedRosterStatus(entry.status))
    .map((entry) => entry.label);
}
