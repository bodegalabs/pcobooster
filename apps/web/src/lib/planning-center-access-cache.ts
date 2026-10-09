import { accessSnapshotSchema } from "@pcobooster/contracts/http/access";
import type { AccessSnapshot } from "@pcobooster/contracts/http/access";

import { savedAnswer } from "@/lib/stored-json";

/** One saved snapshot per selected account, so a switch never shows another's permissions. */
const CACHE_KEY_PREFIX = "pcobooster:planning-center-access:v1:";

const cacheKey = (accountId: string | null): string =>
  `${CACHE_KEY_PREFIX}${accountId ?? "none"}`;

const cachedPayload = savedAnswer(accessSnapshotSchema);

export interface PlanningCenterAccessCacheEntry {
  savedAt: number;
  data: AccessSnapshot;
}

export const readCachedPlanningCenterAccess = (
  accountId: string | null
): PlanningCenterAccessCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }

  try {
    return cachedPayload.parse(storage.getItem(cacheKey(accountId)));
  } catch {
    return undefined;
  }
};

export const writeCachedPlanningCenterAccess = (
  accountId: string | null,
  data: AccessSnapshot
) => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    const saved = cachedPayload.stringify({ savedAt: Date.now(), data });
    if (saved !== undefined) {
      storage.setItem(cacheKey(accountId), saved);
    }
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedPlanningCenterAccess = () => {
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
    // Ignore storage failures; live queries still read Planning Center.
  }
};
