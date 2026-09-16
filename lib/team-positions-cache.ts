import { z } from "zod";

import { teamPositionGroupSchema } from "@/lib/api-schemas";
import { presentationCacheKey } from "@/lib/presentation-cache";
import type { TeamPositionGroup } from "@/lib/types";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:team-positions:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: TeamPositionGroup[];
}

export interface TeamPositionsCacheEntry {
  savedAt: number;
  data: TeamPositionGroup[];
}

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  data: z.array(teamPositionGroupSchema),
});

const buildCacheKey = (
  serviceTypeId: string,
  planId: string,
  seriesId: string | null
): string =>
  presentationCacheKey(
    [
      CACHE_KEY_PREFIX,
      encodeURIComponent(serviceTypeId),
      ":",
      encodeURIComponent(planId),
      ":",
      encodeURIComponent(seriesId ?? "none"),
    ].join("")
  );

export const readCachedTeamPositions = (
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null
): TeamPositionsCacheEntry | undefined => {
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
    const raw = storage.getItem(buildCacheKey(serviceTypeId, planId, seriesId));
    if (raw === null) {
      return undefined;
    }
    const parsed = cachedPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
};

export const writeCachedTeamPositions = (
  serviceTypeId: string | null,
  planId: string | null,
  seriesId: string | null,
  groups: TeamPositionGroup[]
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
      buildCacheKey(serviceTypeId, planId, seriesId),
      JSON.stringify({
        savedAt: Date.now(),
        data: groups,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedTeamPositions = (): void => {
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
