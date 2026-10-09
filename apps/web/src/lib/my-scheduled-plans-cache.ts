import { myScheduledPlansDataSchema } from "@pcobooster/contracts/http/people-schemas";
import type { MyScheduledPlansData } from "@pcobooster/contracts/http/people-schemas";

import { savedAnswer } from "@/lib/stored-json";

const CACHE_KEY = "pcobooster:my-scheduled-plans:v2";
const LEGACY_CACHE_KEY_PREFIX = "pcobooster:my-scheduled-plans:v1:";

const cachedPayload = savedAnswer(myScheduledPlansDataSchema);

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
    return cachedPayload.parse(storage.getItem(CACHE_KEY));
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
    const saved = cachedPayload.stringify({ savedAt: Date.now(), data });
    if (saved !== undefined) {
      storage.setItem(CACHE_KEY, saved);
    }
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
