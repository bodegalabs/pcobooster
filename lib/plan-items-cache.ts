import {
  hydratePlanItems,
  serializePlanItems,
  type SerializedPlanItem,
} from "@/lib/plan-item-client";
import type {
  PlanItem,
  PlanItemServicePosition,
  PlanItemType,
} from "@/lib/types";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:plan-items:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: SerializedPlanItem[];
}

export interface PlanItemsCacheEntry {
  savedAt: number;
  data: PlanItem[];
}

export function readCachedPlanItems(
  serviceTypeId: string | null,
  planId: string | null
): PlanItemsCacheEntry | undefined {
  if (!serviceTypeId || !planId || typeof window === "undefined")
    return undefined;

  try {
    const raw = window.localStorage.getItem(
      buildCacheKey(serviceTypeId, planId)
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isSerializedPlanItemArray(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: hydratePlanItems(parsed.data),
    };
  } catch {
    return undefined;
  }
}

export function writeCachedPlanItems(
  serviceTypeId: string | null,
  planId: string | null,
  items: PlanItem[]
) {
  if (!serviceTypeId || !planId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildCacheKey(serviceTypeId, planId),
      JSON.stringify({
        savedAt: Date.now(),
        data: serializePlanItems(items),
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedPlanItems() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch from Planning Center.
  }
}

function buildCacheKey(serviceTypeId: string, planId: string) {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}:${encodeURIComponent(planId)}`;
}

function isSerializedPlanItemArray(
  value: unknown
): value is SerializedPlanItem[] {
  return Array.isArray(value) && value.every(isSerializedPlanItem);
}

function isSerializedPlanItem(value: unknown): value is SerializedPlanItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SerializedPlanItem>;

  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    isPlanItemType(item.itemType) &&
    typeof item.sequence === "number" &&
    isPlanItemServicePosition(item.servicePosition) &&
    (item.length === null || typeof item.length === "number") &&
    typeof item.description === "string" &&
    typeof item.htmlDetails === "string" &&
    Array.isArray(item.customArrangementSequence) &&
    item.customArrangementSequence.every(
      (entry) => typeof entry === "string"
    ) &&
    isSerializedSong(item.song) &&
    isSerializedArrangement(item.arrangement) &&
    isSerializedKey(item.key) &&
    isSerializedLayout(item.layout)
  );
}

function isPlanItemType(value: unknown): value is PlanItemType {
  return (
    value === "song" ||
    value === "header" ||
    value === "item" ||
    value === "media"
  );
}

function isPlanItemServicePosition(
  value: unknown
): value is PlanItemServicePosition {
  return value === "pre" || value === "during" || value === "post";
}

function isSerializedSong(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const song = value as SerializedPlanItem["song"];
  return (
    !!song &&
    typeof song.id === "string" &&
    typeof song.title === "string" &&
    typeof song.author === "string" &&
    typeof song.themes === "string" &&
    isNullableDateLike(song.lastScheduledAt)
  );
}

function isSerializedArrangement(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const arrangement = value as SerializedPlanItem["arrangement"];
  return (
    !!arrangement &&
    typeof arrangement.id === "string" &&
    typeof arrangement.name === "string" &&
    Array.isArray(arrangement.sequence) &&
    arrangement.sequence.every((entry) => typeof entry === "string") &&
    (arrangement.length === null || typeof arrangement.length === "number") &&
    isNullableDateLike(arrangement.archivedAt)
  );
}

function isSerializedKey(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const key = value as SerializedPlanItem["key"];
  return (
    !!key &&
    typeof key.id === "string" &&
    typeof key.name === "string" &&
    (key.startingKey === null || typeof key.startingKey === "string") &&
    (key.endingKey === null || typeof key.endingKey === "string")
  );
}

function isSerializedLayout(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const layout = value as SerializedPlanItem["layout"];
  return (
    !!layout && typeof layout.id === "string" && typeof layout.name === "string"
  );
}

function isNullableDateLike(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" && !(value instanceof Date)) return false;
  return !Number.isNaN(new Date(value).getTime());
}
