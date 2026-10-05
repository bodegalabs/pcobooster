import { teamPositionGroupSchema } from "@pcobooster/contracts/catalog";
import type { TeamPositionGroup } from "@pcobooster/planning-center-models/types";
import { Schema, Result } from "effect";

import { presentationCacheKey } from "@/lib/presentation-cache";

const CACHE_VERSION = "v2";
const CACHE_KEY_PREFIX = `pcobooster:team-positions:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: TeamPositionGroup[];
}

export interface TeamPositionsCacheEntry {
  savedAt: number;
  data: TeamPositionGroup[];
}

const cachedPayloadSchema = Schema.Struct({
  savedAt: Schema.Finite,
  data: Schema.mutable(Schema.Array(teamPositionGroupSchema)),
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
    const parsed = Schema.decodeUnknownResult(
      Schema.toCodecJson(cachedPayloadSchema)
    )(JSON.parse(raw));
    if (Result.isFailure(parsed)) {
      return undefined;
    }
    return parsed.success;
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
