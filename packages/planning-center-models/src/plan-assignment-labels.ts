import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

const TEAM_PREFIX_SEPARATOR = " - ";

/** "Band - Keys" reads as "Keys"; the team is rarely in doubt on one plan. */
export const positionFromLabel = (label: string): string => {
  const separator = label.indexOf(TEAM_PREFIX_SEPARATOR);
  return separator === -1
    ? label
    : label.slice(separator + TEAM_PREFIX_SEPARATOR.length);
};

const normalizeLabel = (label: string) => label.trim().toLowerCase();

/** Matches a bare slot or its known team prefix without splitting actual slot names. */
export const matchesAssignmentPosition = (
  label: string,
  positionName: string,
  teamName?: string
): boolean => {
  const normalized = normalizeLabel(label);
  return (
    normalized === normalizeLabel(positionName) ||
    (teamName !== undefined &&
      normalized ===
        normalizeLabel(`${teamName.trim()} - ${positionName.trim()}`))
  );
};

/**
 * The plan's assignment labels other than this slot, which they include when the person is
 * on it. Labels come from two sources, "Team - Position" and bare "Position", so a bare
 * label that a prefixed one already names is dropped.
 */
export const otherPlanAssignments = (
  labels: readonly string[],
  teamName: string | null | undefined,
  positionName: string | null | undefined
): string[] => {
  const thisSlot = new Set(
    isNonEmptyString(positionName)
      ? [`${teamName ?? ""} - ${positionName}`, positionName].map(
          normalizeLabel
        )
      : []
  );
  const others = labels.filter((label) => !thisSlot.has(normalizeLabel(label)));
  return others.filter((label) => {
    const bare = normalizeLabel(label);
    return !others.some((other) =>
      normalizeLabel(other).endsWith(` - ${bare}`)
    );
  });
};
