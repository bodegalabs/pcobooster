import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import type {
  PlanPersonNotification,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import type { SlotRef } from "@/components/schedule/types";

/**
 * - `unsent`: the email is prepared but not sent, so the person cannot see or answer the request.
 * - `sent`: Planning Center recorded a send (not proof of delivery).
 * - `unrecorded`: not prepared and no send recorded, for example a cleared prepared state.
 * - `unknown`: Planning Center has not returned the assignment yet.
 */
export type SchedulingNotificationState =
  | "unsent"
  | "sent"
  | "unrecorded"
  | "unknown";

export const getSchedulingNotificationState = (
  notification: PlanPersonNotification | null
): SchedulingNotificationState => {
  if (notification === null) {
    return "unknown";
  }
  if (notification.prepared) {
    return "unsent";
  }
  return notification.sentAt === null ? "unrecorded" : "sent";
};

export interface UnsentAssignment {
  planPersonId: string;
  slot: SlotRef;
}

/** One person waiting on a scheduling email; Planning Center sends one email per person. */
export interface UnnotifiedPerson {
  key: string;
  name: string;
  photoThumbnailUrl: string | null;
  assignments: UnsentAssignment[];
}

/** People with a prepared, unsent scheduling email, in lineup order. */
export const collectUnnotifiedPeople = (
  groups: readonly TeamPositionGroup[]
): UnnotifiedPerson[] => {
  const byKey = new Map<string, UnnotifiedPerson>();
  for (const group of groups) {
    for (const position of group.positions) {
      for (const person of position.filledPeople ?? []) {
        if (getSchedulingNotificationState(person.notification) !== "unsent") {
          continue;
        }
        const key = person.personId ?? `plan-person:${person.planPersonId}`;
        const assignment: UnsentAssignment = {
          planPersonId: person.planPersonId,
          slot: {
            teamId: group.teamId,
            teamName: group.teamName,
            positionId: position.id,
            positionName: position.name,
            source: position.source,
          },
        };
        const existing = byKey.get(key);
        if (existing) {
          existing.assignments.push(assignment);
        } else {
          byKey.set(key, {
            key,
            name: person.name,
            photoThumbnailUrl: person.photoThumbnailUrl ?? null,
            assignments: [assignment],
          });
        }
      }
    }
  }
  return [...byKey.values()];
};

/** Unsent scheduling state for each person on one position, keyed by person id. */
export const getPositionNotificationStates = (
  groups: readonly TeamPositionGroup[] | undefined,
  teamId: string | null,
  positionId: string | null
): Map<string, SchedulingNotificationState> => {
  const states = new Map<string, SchedulingNotificationState>();
  const position = groups
    ?.find((group) => group.teamId === teamId)
    ?.positions.find((row) => row.id === positionId);
  for (const person of position?.filledPeople ?? []) {
    states.set(
      person.personId ?? person.id,
      getSchedulingNotificationState(person.notification)
    );
  }
  return states;
};

/** One line on what Planning Center recorded about an assignment's scheduling email. */
export const describeSchedulingNotification = (
  notification: PlanPersonNotification | null,
  orgTimeZone: string
): string | null => {
  const state = getSchedulingNotificationState(notification);
  if (state === "unsent") {
    return "Not notified yet. They can't see or answer this request until the scheduling email is sent in Planning Center.";
  }
  if (state === "unrecorded") {
    return "No scheduling email recorded in Planning Center.";
  }
  const sentAtValue = state === "sent" ? (notification?.sentAt ?? null) : null;
  const sentAt = sentAtValue === null ? null : new Date(sentAtValue);
  if (sentAt === null || Number.isNaN(sentAt.getTime())) {
    return null;
  }
  const sentOn = formatCalendarDateLabel(sentAt, orgTimeZone, "monthDay");
  const senderName = notification?.senderName ?? null;
  return senderName === null
    ? `Scheduling email sent ${sentOn}.`
    : `Scheduling email sent ${sentOn} by ${senderName}.`;
};
