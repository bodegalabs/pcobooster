export const selectedCustomSlot = (
  route: { source?: string; teamId: string; positionId: string },
  slot: { teamId: string; positionId: string }
): boolean =>
  route.source === "custom" &&
  route.teamId === slot.teamId &&
  route.positionId === slot.positionId;
