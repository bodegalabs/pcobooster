import type {
  FilledPositionPerson,
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

export type PersonStatus = "confirmed" | "pending" | "declined";
export const statusCodes = {
  confirmed: "C",
  pending: "U",
  declined: "D",
} as const;

/** Raw status wins over the mapped status. */
export const personStatus = (
  person: Pick<FilledPositionPerson, "rawStatus" | "status">
): PersonStatus => {
  const raw = person.rawStatus.trim().toLowerCase();
  if (raw === "c" || raw === "confirmed") {
    return "confirmed";
  }
  if (raw === "d" || raw.includes("declined") || raw.includes("removed")) {
    return "declined";
  }
  return person.status === "confirmed" ? "confirmed" : "pending";
};

export const openSlots = (position: TeamPosition): number =>
  Math.max(0, position.neededCount ?? 0);
export const filled = (position: TeamPosition): number =>
  (position.filledConfirmedCount ?? 0) + (position.filledPendingCount ?? 0);
export const isTemporary = (position: TeamPosition): boolean =>
  position.source !== undefined && position.source !== "team_position";
/** Only existing needed-position records can be adjusted. */
export const canAddSlot = (position: TeamPosition): boolean =>
  openSlots(position) > 0 || (position.neededPositionId ?? "") !== "";
export const canRemoveSlot = (position: TeamPosition): boolean =>
  openSlots(position) > 0;

export const staffing = (groups: readonly TeamPositionGroup[]) => {
  const result = { confirmed: 0, pending: 0, declined: 0, open: 0 };
  for (const group of groups) {
    for (const position of group.positions) {
      result.confirmed += position.filledConfirmedCount ?? 0;
      result.pending += position.filledPendingCount ?? 0;
      result.open += openSlots(position);
      result.declined += (position.filledPeople ?? []).filter(
        (person) => personStatus(person) === "declined"
      ).length;
    }
  }
  return result;
};

/** Format an English list of names in lineup order, also on Hermes. */
export const listFormat = (names: readonly string[]): string => {
  if (names.length < 2) {
    return names[0] ?? "";
  }
  if (names.length === 2) {
    return names.join(" and ");
  }
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1) ?? ""}`;
};

/** Declines and removals remove the roster row without changing requested open slots. */
export const editRosterPerson = (
  groups: readonly TeamPositionGroup[],
  planPersonId: string,
  status: PersonStatus | "remove"
): TeamPositionGroup[] =>
  groups.map((group) => ({
    ...group,
    positions: group.positions.map((position) => {
      const person = position.filledPeople?.find(
        (candidate) => candidate.planPersonId === planPersonId
      );
      if (person === undefined) {
        return position;
      }
      const removes = status === "remove" || status === "declined";
      const people = position.filledPeople ?? [];
      const updatedPeople = removes
        ? people.filter((candidate) => candidate.planPersonId !== planPersonId)
        : people
            .map((candidate) =>
              candidate.planPersonId === planPersonId
                ? { ...candidate, status, rawStatus: statusCodes[status] }
                : candidate
            )
            .toSorted((a, b) => {
              if (a.status !== b.status) {
                return a.status === "confirmed" ? -1 : 1;
              }
              return a.name.localeCompare(b.name);
            });
      return {
        ...position,
        filledPeople: updatedPeople,
        filledConfirmedCount: updatedPeople.filter(
          (candidate) => candidate.status === "confirmed"
        ).length,
        filledPendingCount: updatedPeople.filter(
          (candidate) => candidate.status === "pending"
        ).length,
      };
    }),
  }));

export const adjustOpenSlots = (
  groups: readonly TeamPositionGroup[],
  teamId: string,
  positionId: string,
  change: "add" | "remove"
): TeamPositionGroup[] =>
  groups.map((group) =>
    group.teamId === teamId
      ? {
          ...group,
          positions: group.positions.map((position) =>
            position.id === positionId
              ? {
                  ...position,
                  neededCount: Math.max(
                    0,
                    openSlots(position) + (change === "add" ? 1 : -1)
                  ),
                }
              : position
          ),
        }
      : group
  );
