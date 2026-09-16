import { z } from "zod";

export interface MyScheduledPlansData {
  planIds: string[];
}

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:my-scheduled-plans:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: MyScheduledPlansData;
}

const buildCacheKey = (planIdsKey: string) =>
  `${CACHE_KEY_PREFIX}${encodeURIComponent(planIdsKey)}`;

const myScheduledPlansDataSchema = z.object({
  planIds: z.array(z.string()),
});

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  data: myScheduledPlansDataSchema,
});

export interface MyScheduledPlansCacheEntry {
  savedAt: number;
  data: MyScheduledPlansData;
}

export const readCachedMyScheduledPlans = (
  planIdsKey: string
): MyScheduledPlansCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (planIdsKey.length === 0 || storage === undefined) {
    return undefined;
  }

  try {
    const raw = storage.getItem(buildCacheKey(planIdsKey));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return undefined;
    }

    return {
      savedAt: parsed.data.savedAt,
      data: parsed.data.data,
    };
  } catch {
    return undefined;
  }
};

export const writeCachedMyScheduledPlans = (
  planIdsKey: string,
  data: MyScheduledPlansData
) => {
  const storage = globalThis.window?.localStorage;
  if (planIdsKey.length === 0 || storage === undefined) {
    return;
  }

  try {
    storage.setItem(
      buildCacheKey(planIdsKey),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedMyScheduledPlans = () => {
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
    // Ignore storage failures; live queries will still fetch Planning Center.
  }
};
