import {
  isDeclinedAssignmentStatus,
  summarizeCandidateHistory,
} from "@pcobooster/planning-center-models/candidate-frequency";
import {
  scoreAndNormalizePeople,
  sortPeopleForSelection,
} from "@pcobooster/planning-center-models/candidate-scoring";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type {
  PersonWithAvailability,
  ServiceHistoryItem,
} from "@pcobooster/planning-center-models/types";

/**
 * How a scheduler's candidate list is built from its progressive parts: candidates (with the
 * selected plan's fresh roster), plan-window history, and per-candidate availability. The API
 * returns the parts; the browser assembles them with `assemblePositionCandidates`.
 */

/** The selected plan and slot that candidates are matched against. */
export interface SelectedPlanMatchContext {
  planId?: string;
  teamId?: string;
  selectedPositionName?: string;
  selectedTeamName?: string;
}

export type SelectedPlanRosterStatus = "confirmed" | "pending" | "declined";

/** A person's roster entry for the selected slot on the selected plan. */
export interface SelectedPlanSlot {
  planPersonId: string;
  status: SelectedPlanRosterStatus;
  declineReason: string | null;
}

/** A candidate for a position, with the selected plan's fresh roster applied. */
export interface PositionCandidate {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  photoUrl: string | null;
  photoThumbnailUrl: string | null;
  archived: boolean;
  /** Labels of the person's non-declined roster entries on the selected plan. */
  selectedPlanRosterLabels: string[];
  selectedPlanSlot: SelectedPlanSlot | null;
}

/**
 * One of a person's assignments on the selected plan, as history saw it: a roster row
 * (`planPerson`) from the plan window, or one of the person's own schedules (`schedule`).
 */
export interface SelectedPlanAssignment {
  source: "planPerson" | "schedule";
  id: string;
  planId: string | null;
  teamId: string | null;
  /** A schedule's own `team_name`; roster rows name the team only in the position name. */
  teamName: string | null;
  teamPositionName: string;
  status: string;
  /** A schedule's plan person; roster rows are plan people themselves. */
  planPersonId: string | null;
  /** Trimmed `decline_reason`, or null when empty. */
  declineReason: string | null;
}

/** A candidate's history rows (unsorted) and their selected-plan assignments. */
export interface CandidateHistory {
  serviceHistory: ServiceHistoryItem[];
  selectedPlanAssignments: SelectedPlanAssignment[];
}

export const EMPTY_CANDIDATE_HISTORY: CandidateHistory = {
  serviceHistory: [],
  selectedPlanAssignments: [],
};

const parseTeamPositionName = (
  teamPositionName: string
): { teamName?: string; positionName: string } | null => {
  const raw = teamPositionName.trim();
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
  return { teamName: teamName || undefined, positionName };
};

const readAssignmentTeamPosition = (
  assignment: SelectedPlanAssignment
): { teamName?: string; positionName: string } | null => {
  const parsed = parseTeamPositionName(assignment.teamPositionName);
  if (!parsed) {
    return null;
  }
  const explicitTeamName =
    assignment.source === "schedule" && assignment.teamName !== null
      ? assignment.teamName.trim()
      : "";
  return {
    ...parsed,
    teamName: (parsed.teamName ?? explicitTeamName) || undefined,
  };
};

/** The assignment for the selected slot on the selected plan, if the person has one. */
export const findSelectedSlotAssignment = (
  assignments: readonly SelectedPlanAssignment[],
  context: SelectedPlanMatchContext
): SelectedPlanAssignment | undefined => {
  const { planId, teamId, selectedPositionName, selectedTeamName } = context;
  if (!isNonEmptyString(planId) || !isNonEmptyString(selectedPositionName)) {
    return undefined;
  }
  return assignments.find((assignment) => {
    if (assignment.planId !== planId) {
      return false;
    }
    if (
      isNonEmptyString(teamId) &&
      isNonEmptyString(assignment.teamId) &&
      assignment.teamId !== teamId
    ) {
      return false;
    }
    const parsed = readAssignmentTeamPosition(assignment);
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

/** "Team - Position" labels of the person's non-declined assignments on the selected plan. */
export const getSelectedPlanAssignmentLabels = (
  assignments: readonly SelectedPlanAssignment[],
  context: SelectedPlanMatchContext
): string[] => {
  const { planId } = context;
  if (!isNonEmptyString(planId)) {
    return [];
  }
  const labels = new Set<string>();
  for (const assignment of assignments) {
    if (
      assignment.planId !== planId ||
      isDeclinedAssignmentStatus(assignment.status)
    ) {
      continue;
    }
    const parsed = readAssignmentTeamPosition(assignment);
    if (!parsed) {
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

/** Case-insensitive union of label groups; a later spelling of a label wins. */
export const mergeAssignmentLabels = (
  ...labelGroups: readonly (readonly string[])[]
): string[] => {
  const merged = new Map<string, string>();
  for (const rawLabel of labelGroups.flat()) {
    const label = rawLabel.trim();
    if (label) {
      merged.set(label.toLowerCase(), label);
    }
  }
  return [...merged.values()];
};

const createCandidatePerson = (
  candidate: PositionCandidate
): PersonWithAvailability => ({
  id: candidate.id,
  firstName: candidate.firstName,
  lastName: candidate.lastName,
  fullName: candidate.fullName,
  photoUrl: candidate.photoUrl,
  photoThumbnailUrl: candidate.photoThumbnailUrl,
  archived: candidate.archived,
  positions: [],
  isScheduledForSelectedPlanPosition: false,
  isConfirmedForSelectedPlanPosition: false,
  isDeclinedForSelectedPlanPosition: false,
  selectedPlanAssignmentLabels: [],
});

const applySelectedSlot = (
  person: PersonWithAvailability,
  slot: SelectedPlanSlot | null,
  labels: string[]
) => {
  person.selectedPlanAssignmentLabels = labels;
  person.selectedPlanDeclineReason = undefined;
  if (slot === null) {
    return;
  }
  person.isScheduledForSelectedPlanPosition = true;
  person.isConfirmedForSelectedPlanPosition = slot.status === "confirmed";
  person.isDeclinedForSelectedPlanPosition = slot.status === "declined";
  person.scheduledPlanPersonId = slot.planPersonId;
  if (person.isDeclinedForSelectedPlanPosition) {
    person.selectedPlanDeclineReason = slot.declineReason;
  }
};

const applySelectedAssignment = (
  person: PersonWithAvailability,
  assignment: SelectedPlanAssignment | undefined,
  labels: string[]
) => {
  person.selectedPlanAssignmentLabels = labels;
  person.selectedPlanDeclineReason = undefined;
  if (assignment === undefined) {
    return;
  }
  const { status } = assignment;
  person.isScheduledForSelectedPlanPosition = true;
  person.isConfirmedForSelectedPlanPosition =
    status === "C" || status.toLowerCase() === "confirmed";
  person.isDeclinedForSelectedPlanPosition = isDeclinedAssignmentStatus(status);
  person.scheduledPlanPersonId =
    (assignment.source === "schedule" ? assignment.planPersonId : null) ??
    assignment.id;
  if (person.isDeclinedForSelectedPlanPosition) {
    person.selectedPlanDeclineReason = assignment.declineReason;
  }
};

export interface PositionCandidateSources {
  candidates: readonly PositionCandidate[];
  match: SelectedPlanMatchContext;
  /** The selected plan's sort instant. */
  referenceDate: Date;
  /** The organization's IANA time zone. */
  timeZone: string;
  /** A candidate's history, or undefined while it is loading. */
  historyFor: (personId: string) => CandidateHistory | undefined;
  /** Whether a blockout covers the plan date, or undefined while loading. */
  blockedFor: (personId: string) => boolean | undefined;
}

export interface AssembledPositionCandidates {
  people: PersonWithAvailability[];
  /**
   * Every candidate's history and availability arrived. Only then are scores computed (they are
   * normalized across available candidates) and people sorted for selection; until then people
   * keep the candidates' order and have no score.
   */
  complete: boolean;
}

/**
 * Builds the candidate list from whatever parts have arrived. Once complete, the result equals
 * what the single-call candidate list returned: the fresh roster decides the selected slot, and
 * history's own copy of the selected plan fills in when the roster has no entry for the slot.
 */
export const assemblePositionCandidates = ({
  candidates,
  match,
  referenceDate,
  timeZone,
  historyFor,
  blockedFor,
}: PositionCandidateSources): AssembledPositionCandidates => {
  let complete = true;
  const people = candidates.map((candidate) => {
    const person = createCandidatePerson(candidate);
    const history = historyFor(candidate.id);
    if (history === undefined) {
      complete = false;
      applySelectedSlot(
        person,
        candidate.selectedPlanSlot,
        candidate.selectedPlanRosterLabels
      );
    } else {
      const summary = summarizeCandidateHistory(
        history.serviceHistory,
        referenceDate,
        timeZone
      );
      person.frequency = summary.frequency;
      person.serviceHistory = summary.serviceHistory;
      const labels = mergeAssignmentLabels(
        candidate.selectedPlanRosterLabels,
        getSelectedPlanAssignmentLabels(history.selectedPlanAssignments, match)
      );
      if (candidate.selectedPlanSlot === null) {
        applySelectedAssignment(
          person,
          findSelectedSlotAssignment(history.selectedPlanAssignments, match),
          labels
        );
      } else {
        applySelectedSlot(person, candidate.selectedPlanSlot, labels);
      }
    }

    const blocked = blockedFor(candidate.id);
    if (blocked === undefined) {
      complete = false;
      person.availability = "unknown";
    } else {
      person.isBlockedForDate = blocked;
      person.availability = blocked ? "blocked" : "available";
    }
    return person;
  });

  if (complete) {
    scoreAndNormalizePeople(people, referenceDate, timeZone);
    sortPeopleForSelection(people);
  }
  return { people, complete };
};
