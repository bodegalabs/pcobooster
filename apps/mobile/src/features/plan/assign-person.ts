import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

import type { AssignmentIdentity } from "./assignment";

export interface AssignPerson {
  id: string;
  fullName: string;
  photoThumbnailUrl: string | null;
}

export const addRosterPerson = (
  groups: readonly TeamPositionGroup[],
  position: Pick<TeamPosition, "teamId" | "id">,
  person: AssignPerson,
  planPersonId: string
): TeamPositionGroup[] =>
  groups.map((group) =>
    group.teamId === position.teamId
      ? {
          ...group,
          positions: group.positions.map((slot) => {
            if (slot.id !== position.id) {
              return slot;
            }
            const people = slot.filledPeople ?? [];
            if (people.some((p) => p.personId === person.id)) {
              return slot;
            }
            const added: FilledPositionPerson = {
              id: person.id,
              personId: person.id,
              planPersonId,
              name: person.fullName,
              photoThumbnailUrl: person.photoThumbnailUrl,
              status: "pending",
              rawStatus: "U",
              notification: { prepared: true, sentAt: null, senderName: null },
            };
            const next = [
              ...people.filter((p) => p.personId !== person.id),
              added,
            ];
            return {
              ...slot,
              filledPeople: next,
              neededCount: Math.max(0, (slot.neededCount ?? 0) - 1),
              filledPendingCount: next.filter((p) => p.status === "pending")
                .length,
              filledConfirmedCount: next.filter((p) => p.status === "confirmed")
                .length,
            };
          }),
        }
      : group
  );

export interface RosterPersonLocation {
  position: TeamPosition;
  person: FilledPositionPerson;
}
export const locateRosterPerson = (
  groups: readonly TeamPositionGroup[],
  identity: AssignmentIdentity
): RosterPersonLocation | undefined => {
  for (const group of groups) {
    for (const position of group.positions) {
      if (
        position.teamId !== identity.teamId ||
        position.id !== identity.positionId
      ) {
        continue;
      }
      const person = position.filledPeople?.find(
        (entry) => (entry.personId ?? entry.id) === identity.personId
      );
      if (person !== undefined) {
        return { position, person };
      }
    }
  }
  return undefined;
};
/** Puts a declined person back unless the position already lists them, under any plan person id. */
export const restoreRosterPerson = (
  groups: readonly TeamPositionGroup[],
  location: RosterPersonLocation
): TeamPositionGroup[] =>
  groups.map((group) => ({
    ...group,
    positions: group.positions.map((position) => {
      if (
        position.id !== location.position.id ||
        position.teamId !== location.position.teamId ||
        position.filledPeople?.some(
          (person) =>
            (person.personId ?? person.id) ===
            (location.person.personId ?? location.person.id)
        ) === true
      ) {
        return position;
      }
      const people = [...(position.filledPeople ?? []), location.person];
      return {
        ...position,
        filledPeople: people,
        filledConfirmedCount: people.filter(
          (person) => person.status === "confirmed"
        ).length,
        filledPendingCount: people.filter(
          (person) => person.status === "pending"
        ).length,
      };
    }),
  }));
