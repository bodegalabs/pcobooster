import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";

/** Same synthetic slot ID web and native use until Planning Center creates an assignment. */
export const buildPlanMemberPositionId = (
  teamId: string,
  positionName: string
): string =>
  `plan-member-position:${teamId}:${encodeURIComponent(positionName.trim().toLowerCase())}`;

/** A plan-only position is a local selection; the provider creates it on confirmed scheduling. */
export const addCustomLineupPosition = (
  groups: TeamPositionGroup[],
  teamId: string,
  positionName: string
): { groups: TeamPositionGroup[]; positionId: string } | null => {
  const name = positionName.trim();
  const team = groups.find((group) => group.teamId === teamId);
  if (!name || team === undefined) {
    return null;
  }
  const existing = team.positions.find(
    (position) => position.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (existing !== undefined) {
    return { groups, positionId: existing.id };
  }
  const id = buildPlanMemberPositionId(teamId, name);
  return {
    positionId: id,
    groups: groups.map((group) =>
      group.teamId === teamId
        ? {
            ...group,
            positions: [
              ...group.positions,
              {
                id,
                name,
                teamId,
                teamName: group.teamName,
                source: "custom" as const,
                neededCount: 0,
              },
            ].toSorted((left, right) => left.name.localeCompare(right.name)),
          }
        : group
    ),
  };
};
