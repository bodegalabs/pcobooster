import { Schema } from "effect";

import { storedJson } from "@/lib/stored-json";

const CACHE_VERSION = "v1";
const CACHE_KEY = `pcobooster:organization-time-zone:${CACHE_VERSION}`;

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

const cachedPayload = storedJson(
  Schema.Struct({
    savedAt: Schema.Finite,
    timeZone: Schema.String.check(
      Schema.makeFilter(isUsableTimeZone, {
        expected: "a time zone this browser knows",
      })
    ),
  })
);

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
    return cachedPayload.parse(storage.getItem(CACHE_KEY));
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
    const saved = cachedPayload.stringify({ savedAt: Date.now(), timeZone });
    if (saved !== undefined) {
      storage.setItem(CACHE_KEY, saved);
    }
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
