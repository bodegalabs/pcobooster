import { PositionMismatch } from "@pcobooster/contracts/faults/position-mismatch";
import { RateLimited } from "@pcobooster/contracts/faults/rate-limited";
import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { summarizeCandidateSchedule } from "@pcobooster/planning-center-models/candidate-summary";
import { customPositionFromId } from "@pcobooster/planning-center-models/custom-position";
import {
  otherPlanAssignments,
  positionFromLabel,
} from "@pcobooster/planning-center-models/plan-assignment-labels";
import { preferenceConflicts } from "@pcobooster/planning-center-models/ranking-reasons";
import type { RankingFactKind } from "@pcobooster/planning-center-models/ranking-reasons";
import type { ScheduleDay } from "@pcobooster/planning-center-models/schedule-days";
import type { SchedulingPreferences } from "@pcobooster/planning-center-models/scheduling-preferences";
import type {
  FilledPositionPerson,
  PersonWithAvailability,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import type { ScheduleStatus, StatusTone } from "../../design/status";
import type { AppSymbolName } from "../../design/symbols";
import {
  filled,
  isTemporary,
  listFormat,
  openSlots,
  personStatus,
} from "../plan/roster";

export interface ResolvedSlot {
  group: TeamPositionGroup;
  position: TeamPosition;
}
export const slotKey = ({ group, position }: ResolvedSlot): string =>
  `${group.teamId}|${position.id}`;
export const allSlots = (
  groups: readonly TeamPositionGroup[]
): ResolvedSlot[] =>
  groups.flatMap((group) =>
    group.positions.map((position) => ({ group, position }))
  );

export const nextOpenSlot = (
  groups: readonly TeamPositionGroup[],
  current?: ResolvedSlot
): ResolvedSlot | undefined => {
  const slots = allSlots(groups);
  const index =
    current === undefined
      ? -1
      : slots.findIndex((slot) => slotKey(slot) === slotKey(current));
  const after = [
    ...slots.slice(index + 1),
    ...slots.slice(0, Math.max(0, index)),
  ];
  return after.find(({ position }) => openSlots(position) > 0);
};
export const resolveSlot = (
  groups: readonly TeamPositionGroup[],
  teamId?: string,
  positionId?: string
): ResolvedSlot | undefined =>
  allSlots(groups).find(
    (slot) =>
      slot.position.id === positionId &&
      (teamId === undefined || slot.group.teamId === teamId)
  ) ??
  nextOpenSlot(groups) ??
  allSlots(groups)[0];

/**
 * The open position for a selection key. A custom position a refetch dropped before anyone
 * filled it is rebuilt from its id, as Swift's `AssignModel.lookup` does.
 */
export const selectedSlot = (
  groups: readonly TeamPositionGroup[],
  selection: string
): ResolvedSlot | undefined => {
  const found = allSlots(groups).find((slot) => slotKey(slot) === selection);
  if (found !== undefined) {
    return found;
  }
  const separator = selection.indexOf("|");
  const group = groups.find(
    (entry) => entry.teamId === selection.slice(0, separator)
  );
  const position =
    group === undefined
      ? undefined
      : customPositionFromId(selection.slice(separator + 1), group.teamName);
  return group === undefined || position === undefined
    ? undefined
    : { group, position };
};

/**
 * What a failed add says under the row (Swift's `assignMessage`): the position Planning
 * Center used for a mismatch, how long to wait when it's busy, otherwise `fallback`.
 */
export const assignFailureMessage = (
  error: Error,
  fallback: (error: Error) => string
): string => {
  if (error instanceof PositionMismatch) {
    const { selected, created } = error.details;
    return `Created in "${created.teamPositionName}" instead of "${selected.teamName} - ${selected.positionName}".`;
  }
  if (error instanceof RateLimited) {
    return error.retryAfterSeconds === undefined
      ? "Planning Center is busy. Try again in a moment."
      : `Planning Center is busy. Try again in ${Math.max(1, Math.floor(error.retryAfterSeconds))} seconds.`;
  }
  return fallback(error);
};

/** A position's state in the title menu (`AssignView.openLabel`). */
export const openLabel = (position: TeamPosition): string => {
  const open = openSlots(position);
  if (open === 0) {
    return filled(position) === 0 ? "No one yet" : "Filled";
  }
  return `${open} open`;
};

/** The quiet row under the people on the slot (`AssignOpenSlotsRow`). */
export const openSlotsLabel = (open: number): string => {
  if (open === 0) {
    return "No open slots";
  }
  return open === 1 ? "1 open slot" : `${open} open slots`;
};

export const someoneElseDisabledReason = (
  canSchedule: boolean,
  canSearch: boolean
): string | undefined => {
  if (!canSchedule) {
    return "Scheduling is turned off for you here.";
  }
  return canSearch
    ? undefined
    : "You can schedule team members, but can't search the rest of your church.";
};

export const emptyCandidatesMessage = (
  position: TeamPosition,
  filter: string
): string => {
  if (isTemporary(position)) {
    return "This position has no roster. Search for anyone below.";
  }
  return filter.trim() === ""
    ? "Everyone on the roster is scheduled or unavailable."
    : "No one matches.";
};

/** The icon beside a ranking reason (Swift `RankingFactKind.rankingSymbol`). */
export const rankingSymbol: Record<RankingFactKind, AppSymbolName> = {
  history: "reasonHistory",
  fresh: "reasonFresh",
  service: "reasonService",
  rehearsal: "reasonRehearsal",
  load: "reasonLoad",
  preference: "reasonPreference",
  note: "reasonNote",
};

export const fitTone = (score: number): StatusTone => {
  if (score >= 80) {
    return "confirmed";
  }
  return score >= 50 ? "pending" : "declined";
};

export const candidatePresentation = (
  person: PersonWithAvailability,
  slot: ResolvedSlot,
  date: Date,
  zone: string
) => {
  const scheduled =
    person.isScheduledForSelectedPlanPosition === true ||
    person.isConfirmedForSelectedPlanPosition === true;
  const blocked = person.isBlockedForDate === true;
  const declined = person.isDeclinedForSelectedPlanPosition === true;
  const others = declined
    ? []
    : otherPlanAssignments(
        person.selectedPlanAssignmentLabels ?? [],
        slot.group.teamName,
        slot.position.name
      );
  const status = ((): ScheduleStatus | undefined => {
    if (!scheduled) {
      return undefined;
    }
    if (person.isConfirmedForSelectedPlanPosition === true) {
      return "confirmed";
    }
    return declined ? "declined" : "pending";
  })();
  const disabledReason = (() => {
    if (blocked) {
      return "Blocked out for this date";
    }
    if (declined) {
      return "Declined this position";
    }
    return scheduled ? "Already scheduled for this position" : undefined;
  })();
  const conflicts = preferenceConflicts(person.recommendationReasoning ?? []);
  const facts = [
    ...others.map((label) => `Also on ${positionFromLabel(label)}`),
    ...conflicts,
    ...summarizeCandidateSchedule(person.frequency, date, zone, {
      onThisPlan: scheduled || others.length > 0,
    }),
  ];
  return {
    scheduled,
    blocked,
    declined,
    others,
    status,
    disabledReason,
    showsFit: !scheduled && !blocked,
    facts,
    conflicts,
    score:
      person.recommendationScore === undefined
        ? undefined
        : Math.round(person.recommendationScore),
  };
};

export type CandidatePresentation = ReturnType<typeof candidatePresentation>;

/**
 * The lineup decides who is on the slot: the shared writer edits it at once, and it refetches
 * when the writes settle. A declined person is off the lineup but stays on the slot as declined.
 */
export const reconcileRoster = (
  people: readonly PersonWithAvailability[],
  position: TeamPosition
): PersonWithAvailability[] =>
  people.map((person) => {
    const roster = position.filledPeople?.find(
      (entry) => entry.personId === person.id
    );
    if (roster === undefined) {
      return {
        ...person,
        isScheduledForSelectedPlanPosition:
          person.isDeclinedForSelectedPlanPosition === true,
        isConfirmedForSelectedPlanPosition: false,
      };
    }
    const status = personStatus(roster);
    return {
      ...person,
      isScheduledForSelectedPlanPosition: true,
      isConfirmedForSelectedPlanPosition: status === "confirmed",
      isDeclinedForSelectedPlanPosition: status === "declined",
      scheduledPlanPersonId: roster.planPersonId,
    };
  });

/** The plan person whose status a candidate's menu changes; none unless they're on the slot. */
export const rosterPersonFor = (
  person: PersonWithAvailability,
  position: TeamPosition
): FilledPositionPerson | undefined => {
  if (person.isScheduledForSelectedPlanPosition !== true) {
    return undefined;
  }
  const existing = position.filledPeople?.find(
    (entry) => entry.personId === person.id
  );
  if (
    existing !== undefined ||
    person.scheduledPlanPersonId === undefined ||
    person.scheduledPlanPersonId === null
  ) {
    return existing;
  }
  return {
    id: person.id,
    personId: person.id,
    planPersonId: person.scheduledPlanPersonId,
    name: person.fullName,
    photoThumbnailUrl: person.photoThumbnailUrl,
    status: "pending",
    rawStatus: person.isDeclinedForSelectedPlanPosition === true ? "D" : "U",
    notification: null,
  };
};

export const preferenceLines = (
  preferences: SchedulingPreferences
): string[] => {
  const lines: string[] = [];
  const preference = preferences.schedulePreference?.trim() ?? "";
  if (preference !== "") {
    lines.push(`Prefers ${preference.toLowerCase()}`);
  }
  if (preferences.preferredWeeks.length > 0) {
    const weeks = preferences.preferredWeeks
      .toSorted((a, b) => a - b)
      .map(String);
    lines.push(
      `${weeks.length > 1 ? "Weeks" : "Week"} ${listFormat(weeks)} of the month`
    );
  }
  if (preferences.maxPlansPerDay !== null) {
    const count = preferences.maxPlansPerDay;
    lines.push(`At most ${count} ${count === 1 ? "plan" : "plans"} a day`);
  }
  if (preferences.maxPlansPerMonth !== null) {
    const count = preferences.maxPlansPerMonth;
    lines.push(`At most ${count} ${count === 1 ? "plan" : "plans"} a month`);
  }
  return lines;
};

export const dayLabel = (day: ScheduleDay): string =>
  formatCalendarDateLabel(
    new Date(`${day.dayKey}T12:00:00Z`),
    "UTC",
    "monthDay"
  );
export const nearestBusyDay = (
  days: readonly ScheduleDay[],
  index: number
): ScheduleDay | undefined => {
  const target = Math.max(0, Math.min(days.length - 1, index));
  const busy = days.filter((day) => day.kind !== "free");
  const [nearest] = busy.toSorted(
    (a, b) =>
      Math.abs(days.indexOf(a) - target) - Math.abs(days.indexOf(b) - target)
  );
  return nearest !== undefined && Math.abs(days.indexOf(nearest) - target) <= 3
    ? nearest
    : undefined;
};
export const dayEntries = (day: ScheduleDay) => {
  const seen = new Set<string>();
  return day.items
    .filter((item) => {
      const key = `${item.teamPositionName}|${item.serviceTypeName ?? ""}|${item.planId ?? ""}|${item.timeType === "rehearsal" ? "r" : "s"}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .toSorted(
      (a, b) =>
        Number(a.timeType === "rehearsal") - Number(b.timeType === "rehearsal")
    );
};
