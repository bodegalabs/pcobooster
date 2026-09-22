import { z } from "zod";

const CACHE_VERSION = "v1";
const CACHE_KEY = `pcobooster:organization-time-zone:${CACHE_VERSION}`;

interface CachedPayload {
  savedAt: number;
  timeZone: string;
}

const isUsableTimeZone = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  try {
    const formatter = Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return formatter.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

const cachedPayloadSchema = z.object({
  savedAt: z.number(),
  timeZone: z.string().refine(isUsableTimeZone),
});

export interface OrganizationTimeZoneCacheEntry {
  savedAt: number;
  timeZone: string;
}

export const readCachedOrganizationTimeZone = ():
  | OrganizationTimeZoneCacheEntry
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
      timeZone: parsed.data.timeZone,
    };
  } catch {
    return undefined;
  }
};

export const writeCachedOrganizationTimeZone = (timeZone: string) => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }
  if (!isUsableTimeZone(timeZone)) {
    return;
  }

  try {
    storage.setItem(
      CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        timeZone,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

export const clearCachedOrganizationTimeZone = () => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }

  try {
    storage.removeItem(CACHE_KEY);
  } catch {
    // Ignore storage failures; live queries still fetch Planning Center.
  }
};
