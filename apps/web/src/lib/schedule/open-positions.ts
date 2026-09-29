import type {
  TeamPosition,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";

export interface OpenPositionRef {
  teamId: string;
  teamName: string;
  positionId: string;
  positionName: string;
  source?: TeamPosition["source"];
}

/** Open slots Planning Center still needs someone for on this position. */
export const openSlotCount = (position: TeamPosition): number =>
  position.neededCount ?? 0;

const toRef = (
  group: TeamPositionGroup,
  position: TeamPosition
): OpenPositionRef => ({
  teamId: group.teamId,
  teamName: group.teamName,
  positionId: position.id,
  positionName: position.name,
  source: position.source,
});

/** The first position in list order, filled or not. */
export const findFirstPosition = (
  groups: readonly TeamPositionGroup[]
): OpenPositionRef | null => {
  for (const group of groups) {
    const [position] = group.positions;
    if (position !== undefined) {
      return toRef(group, position);
    }
  }
  return null;
};

/**
 * The next position, in list order after `current`, that still has open slots, wrapping
 * past the end; the first open position when nothing is selected. Null when every other
 * position is filled.
 */
export const findNextOpenPosition = (
  groups: readonly TeamPositionGroup[],
  current: { teamId: string; positionId: string } | null
): OpenPositionRef | null => {
  const ordered = groups.flatMap((group) =>
    group.positions.map((position) => ({ group, position }))
  );
  const currentIndex =
    current === null
      ? -1
      : ordered.findIndex(
          ({ group, position }) =>
            group.teamId === current.teamId &&
            position.id === current.positionId
        );
  for (let step = 1; step <= ordered.length; step += 1) {
    const index = (currentIndex + step) % ordered.length;
    const entry = ordered.at(index);
    if (entry === undefined || index === currentIndex) {
      continue;
    }
    if (openSlotCount(entry.position) > 0) {
      return toRef(entry.group, entry.position);
    }
  }
  return null;
};
