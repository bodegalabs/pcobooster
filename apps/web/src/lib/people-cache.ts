import type { PersonWithAvailability } from "@worship-admin/planning-center-models/types";
import { z } from "zod";

import { persistedPersonWithAvailabilitySchema } from "@/lib/persistence-schemas";
import { presentationCacheKey } from "@/lib/presentation-cache";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:people:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: PersonWithAvailability[];
}

export interface PeopleCacheEntry {
  savedAt: number;
  data: PersonWithAvailability[];
}

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  data: z.array(persistedPersonWithAvailabilitySchema),
});

const buildCacheKey = (
  serviceTypeId: string,
  teamId: string | null,
  positionId: string,
  planId: string | null,
  dateKey: string | null
): string =>
  presentationCacheKey(
    [
      CACHE_KEY_PREFIX,
      encodeURIComponent(serviceTypeId),
      ":",
      encodeURIComponent(teamId ?? "none"),
      ":",
      encodeURIComponent(positionId),
      ":",
      encodeURIComponent(planId ?? "none"),
      ":",
      encodeURIComponent(dateKey ?? "none"),
    ].join("")
  );

export const readCachedPeople = (
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null,
  dateKey: string | null
): PeopleCacheEntry | undefined => {
  const storage = globalThis.window?.localStorage;
  if (
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    positionId === null ||
    positionId.length === 0 ||
    storage === undefined
  ) {
    return undefined;
  }

  try {
    const raw = storage.getItem(
      buildCacheKey(serviceTypeId, teamId, positionId, planId, dateKey)
    );
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

export const writeCachedPeople = (
  serviceTypeId: string | null,
  teamId: string | null,
  positionId: string | null,
  planId: string | null,
  dateKey: string | null,
  people: PersonWithAvailability[]
): void => {
  const storage = globalThis.window?.localStorage;
  if (
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    positionId === null ||
    positionId.length === 0 ||
    storage === undefined
  ) {
    return;
  }

  try {
    storage.setItem(
      buildCacheKey(serviceTypeId, teamId, positionId, planId, dateKey),
      JSON.stringify({
        savedAt: Date.now(),
        data: people,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedPeople = (): void => {
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
