import type { TeamPositionGroup } from "@/lib/types";

export const reorderLineupColumnIds = (
  columnIds: string[],
  activeId: string,
  overId: string
): string[] => {
  if (activeId === overId) {
    return columnIds;
  }

  const fromIndex = columnIds.indexOf(activeId);
  const toIndex = columnIds.indexOf(overId);
  if (fromIndex === -1 || toIndex === -1) {
    return columnIds;
  }

  const nextColumnIds = [...columnIds];
  const [movedId] = nextColumnIds.splice(fromIndex, 1);
  if (movedId === undefined) {
    return columnIds;
  }
  nextColumnIds.splice(toIndex, 0, movedId);
  return nextColumnIds;
};

export const resolveLineupColumnOrder = (
  groups: TeamPositionGroup[],
  savedOrder: string[] | undefined
): string[] => {
  const groupIds = groups.map((group) => group.teamId);
  if (savedOrder === undefined || savedOrder.length === 0) {
    return groupIds;
  }

  const remainingIds = new Set(groupIds);
  const resolvedOrder: string[] = [];

  for (const teamId of savedOrder) {
    if (remainingIds.has(teamId)) {
      resolvedOrder.push(teamId);
      remainingIds.delete(teamId);
    }
  }

  for (const teamId of groupIds) {
    if (remainingIds.has(teamId)) {
      resolvedOrder.push(teamId);
      remainingIds.delete(teamId);
    }
  }

  return resolvedOrder;
};

export const applyLineupColumnOrder = (
  groups: TeamPositionGroup[],
  savedOrder: string[] | undefined
): TeamPositionGroup[] => {
  const groupById = new Map(groups.map((group) => [group.teamId, group]));
  return resolveLineupColumnOrder(groups, savedOrder).flatMap((teamId) => {
    const group = groupById.get(teamId);
    return group ? [group] : [];
  });
};
