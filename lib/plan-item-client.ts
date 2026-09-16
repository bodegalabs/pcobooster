import { parseOptionalDate } from "@/lib/song-catalog-client";
import type { PlanItem, PlanItemArrangement, PlanItemSong } from "@/lib/types";

export interface SerializedPlanItemSong extends Omit<
  PlanItemSong,
  "lastScheduledAt"
> {
  lastScheduledAt: string | Date | null;
}

export interface SerializedPlanItemArrangement extends Omit<
  PlanItemArrangement,
  "archivedAt"
> {
  archivedAt: string | Date | null;
}

export interface SerializedPlanItem extends Omit<
  PlanItem,
  "song" | "arrangement"
> {
  song: SerializedPlanItemSong | null;
  arrangement: SerializedPlanItemArrangement | null;
}

function serializeSong(
  song: PlanItemSong | null
): SerializedPlanItemSong | null {
  if (!song) return null;
  return {
    ...song,
    lastScheduledAt: song.lastScheduledAt
      ? song.lastScheduledAt.toISOString()
      : null,
  };
}

function serializeArrangement(
  arrangement: PlanItemArrangement | null
): SerializedPlanItemArrangement | null {
  if (!arrangement) return null;
  return {
    ...arrangement,
    archivedAt: arrangement.archivedAt
      ? arrangement.archivedAt.toISOString()
      : null,
  };
}

export function serializePlanItem(item: PlanItem): SerializedPlanItem {
  return {
    ...item,
    song: serializeSong(item.song),
    arrangement: serializeArrangement(item.arrangement),
  };
}

export function serializePlanItems(items: PlanItem[]): SerializedPlanItem[] {
  return items.map(serializePlanItem);
}

export function hydratePlanItem(item: SerializedPlanItem): PlanItem {
  return {
    ...item,
    song: item.song
      ? {
          ...item.song,
          lastScheduledAt: parseOptionalDate(item.song.lastScheduledAt),
        }
      : null,
    arrangement: item.arrangement
      ? {
          ...item.arrangement,
          archivedAt: parseOptionalDate(item.arrangement.archivedAt),
        }
      : null,
  };
}

export function hydratePlanItems(items: SerializedPlanItem[]): PlanItem[] {
  return items.map(hydratePlanItem);
}
