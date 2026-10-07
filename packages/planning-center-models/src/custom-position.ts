import type { TeamPosition, TeamPositionGroup } from "./types";

const PLAN_MEMBER_POSITION_PREFIX = "plan-member-position:";

export const buildPlanMemberPositionId = (
  teamId: string,
  positionName: string
): string =>
  `${PLAN_MEMBER_POSITION_PREFIX}${teamId}:${encodeURIComponent(positionName.trim().toLowerCase())}`;

export const insertCustomPosition = (
  groups: readonly TeamPositionGroup[],
  teamId: string,
  rawName: string
): { groups: TeamPositionGroup[]; position: TeamPosition } | undefined => {
  const name = rawName.trim();
  const group = groups.find((entry) => entry.teamId === teamId);
  if (name === "" || group === undefined) {
    return undefined;
  }
  const existing = group.positions.find(
    (position) => position.name.trim().toLowerCase() === name.toLowerCase()
  );
  const position: TeamPosition = existing ?? {
    id: buildPlanMemberPositionId(teamId, name),
    name,
    teamId,
    teamName: group.teamName,
    source: "custom",
    neededCount: 0,
  };
  return {
    position,
    groups: groups.map((entry) =>
      entry !== group || existing !== undefined
        ? entry
        : {
            ...entry,
            positions: [...entry.positions, position].toSorted((a, b) =>
              a.name.localeCompare(b.name, undefined, { numeric: true })
            ),
          }
    ),
  };
};

/** Capitalizes each word, as Foundation's `capitalized` does. */
const capitalized = (name: string): string =>
  name
    .toLowerCase()
    .replaceAll(/(?<=^|\s)\S/gu, (letter) => letter.toUpperCase());

/**
 * The position a custom id names, for when a refetch dropped it from the cached lineup before
 * anyone was scheduled into it (Swift's `CustomRosterPosition.position(id:teamName:)`).
 */
export const customPositionFromId = (
  id: string,
  teamName: string | undefined
): TeamPosition | undefined => {
  if (!id.startsWith(PLAN_MEMBER_POSITION_PREFIX)) {
    return undefined;
  }
  const rest = id.slice(PLAN_MEMBER_POSITION_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator === -1) {
    return undefined;
  }
  const teamId = rest.slice(0, separator);
  const encoded = rest.slice(separator + 1);
  let name = encoded;
  try {
    name = decodeURIComponent(encoded);
  } catch {
    // A malformed escape keeps the encoded name, as Swift's `removingPercentEncoding` fallback.
  }
  if (teamId === "" || name === "") {
    return undefined;
  }
  return {
    id,
    name: capitalized(name),
    teamId,
    teamName,
    source: "custom",
    neededCount: 0,
  };
};
