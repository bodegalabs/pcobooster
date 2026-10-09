import { planItemSchema } from "@pcobooster/contracts/http/plan-item-schemas";
import { mutableArray } from "@pcobooster/contracts/http/schema";
import type { PlanItem } from "@pcobooster/planning-center-models/types";

import { savedAnswer } from "@/lib/stored-json";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `pcobooster:plan-items:${CACHE_VERSION}:`;

export interface PlanItemsCacheEntry {
  savedAt: number;
  data: PlanItem[];
}

const cachedPayload = savedAnswer(mutableArray(planItemSchema));

const buildCacheKey = (serviceTypeId: string, planId: string): string =>
  `${CACHE_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}:${encodeURIComponent(planId)}`;

export const readCachedPlanItems = (
  serviceTypeId: string | null,
  planId: string | null
): PlanItemsCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    planId === null ||
    planId.length === 0 ||
    storage === undefined
  ) {
    return undefined;
  }

  try {
    return cachedPayload.parse(
      storage.getItem(buildCacheKey(serviceTypeId, planId))
    );
  } catch {
    return undefined;
  }
};

export const writeCachedPlanItems = (
  serviceTypeId: string | null,
  planId: string | null,
  items: PlanItem[]
): void => {
  const storage = globalThis.window?.localStorage;
  if (
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    planId === null ||
    planId.length === 0 ||
    storage === undefined
  ) {
    return;
  }

  try {
    const saved = cachedPayload.stringify({ savedAt: Date.now(), data: items });
    if (saved !== undefined) {
      storage.setItem(buildCacheKey(serviceTypeId, planId), saved);
    }
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedPlanItems = (): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX) === true) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch from Planning Center.
  }
};
