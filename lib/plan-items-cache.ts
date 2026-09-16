import { z } from "zod";

import { serializedPlanItemSchema } from "@/lib/api-schemas";
import { hydratePlanItems, serializePlanItems } from "@/lib/plan-item-client";
import type { SerializedPlanItem } from "@/lib/plan-item-client";
import type { PlanItem } from "@/lib/types";

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

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  data: z.array(serializedPlanItemSchema),
});

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
    const raw = storage.getItem(buildCacheKey(serviceTypeId, planId));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return undefined;
    }
    return {
      savedAt: parsed.data.savedAt,
      data: hydratePlanItems(parsed.data.data),
    };
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
    storage.setItem(
      buildCacheKey(serviceTypeId, planId),
      JSON.stringify({
        savedAt: Date.now(),
        data: serializePlanItems(items),
      } satisfies CachedPayload)
    );
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
