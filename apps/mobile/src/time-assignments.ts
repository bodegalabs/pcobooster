export const timeAssignmentChanges = (
  changes: ReadonlyMap<string, boolean>
) => {
  const assignedNeededPositionIds: string[] = [];
  const clearedNeededPositionIds: string[] = [];
  const assignedPlanPersonIds: string[] = [];
  const clearedPlanPersonIds: string[] = [];
  for (const [key, checked] of changes) {
    if (key.startsWith("needed:")) {
      (checked ? assignedNeededPositionIds : clearedNeededPositionIds).push(
        key.slice(7)
      );
    } else if (key.startsWith("person:")) {
      (checked ? assignedPlanPersonIds : clearedPlanPersonIds).push(
        key.slice(7)
      );
    }
  }
  return {
    assignedNeededPositionIds,
    clearedNeededPositionIds,
    assignedPlanPersonIds,
    clearedPlanPersonIds,
  };
};
