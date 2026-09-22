import type {
  PlanItem,
  PlanItemArrangement,
  PlanItemSong,
} from "@pcobooster/planning-center-models/types";

import { parseOptionalDate } from "@/lib/song-catalog-client";

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

const serializeSong = (
  song: PlanItemSong | null
): SerializedPlanItemSong | null => {
  if (!song) {
    return null;
  }
  return {
    ...song,
    lastScheduledAt: song.lastScheduledAt
      ? song.lastScheduledAt.toISOString()
      : null,
  };
};

const serializeArrangement = (
  arrangement: PlanItemArrangement | null
): SerializedPlanItemArrangement | null => {
  if (!arrangement) {
    return null;
  }
  return {
    ...arrangement,
    archivedAt: arrangement.archivedAt
      ? arrangement.archivedAt.toISOString()
      : null,
  };
};

export const serializePlanItem = (item: PlanItem): SerializedPlanItem => ({
  ...item,
  song: serializeSong(item.song),
  arrangement: serializeArrangement(item.arrangement),
});

export const serializePlanItems = (items: PlanItem[]): SerializedPlanItem[] =>
  items.map(serializePlanItem);

export const hydratePlanItem = (item: SerializedPlanItem): PlanItem => ({
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
});

export const hydratePlanItems = (items: SerializedPlanItem[]): PlanItem[] =>
  items.map(hydratePlanItem);
