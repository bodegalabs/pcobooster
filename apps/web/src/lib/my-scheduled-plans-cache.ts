import { z } from "zod";

export interface MyScheduledPlansData {
  planIds: string[];
}

const CACHE_KEY = "pcobooster:my-scheduled-plans:v2";
const LEGACY_CACHE_KEY_PREFIX = "pcobooster:my-scheduled-plans:v1:";

interface CachedPayload {
  savedAt: number;
  data: MyScheduledPlansData;
}

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

export const readCachedMyScheduledPlans = ():
  | MyScheduledPlansCacheEntry
  | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }

  try {
    const raw = storage.getItem(CACHE_KEY);
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

export const writeCachedMyScheduledPlans = (data: MyScheduledPlansData) => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(
      CACHE_KEY,
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
    storage.removeItem(CACHE_KEY);
    // v1 kept one snapshot per plan-id list; remove any a browser still holds.
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_CACHE_KEY_PREFIX) === true) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch Planning Center.
  }
};
