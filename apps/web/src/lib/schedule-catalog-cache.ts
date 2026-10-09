import {
  planSchema,
  serviceTypeSchema,
} from "@pcobooster/contracts/http/catalog";
import { mutableArray } from "@pcobooster/contracts/http/schema";
import type {
  Plan,
  ServiceType,
} from "@pcobooster/planning-center-models/types";

import { savedAnswer } from "@/lib/stored-json";
import type { StoredJson } from "@/lib/stored-json";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `pcobooster:schedule-catalog:${CACHE_VERSION}:`;
const SERVICE_TYPES_KEY = `${CACHE_KEY_PREFIX}service-types`;
const PLANS_KEY_PREFIX = `${CACHE_KEY_PREFIX}plans:`;

export interface ScheduleCatalogCacheEntry<T> {
  savedAt: number;
  data: T;
}

const serviceTypesPayload = savedAnswer(mutableArray(serviceTypeSchema));
const plansPayload = savedAnswer(mutableArray(planSchema));

const readEntry = <T>(
  key: string,
  payload: StoredJson<ScheduleCatalogCacheEntry<T>>
): ScheduleCatalogCacheEntry<T> | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }
  try {
    return payload.parse(storage.getItem(key));
  } catch {
    return undefined;
  }
};

const writeEntry = <T>(
  key: string,
  payload: StoredJson<ScheduleCatalogCacheEntry<T>>,
  data: T
): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }
  try {
    const saved = payload.stringify({ savedAt: Date.now(), data });
    if (saved !== undefined) {
      storage.setItem(key, saved);
    }
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
};

const buildPlansKey = (serviceTypeId: string): string =>
  `${PLANS_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}`;

const readServiceTypesEntry = ():
  | ScheduleCatalogCacheEntry<ServiceType[]>
  | undefined => readEntry(SERVICE_TYPES_KEY, serviceTypesPayload);

const readPlansEntry = (
  serviceTypeId: string
): ScheduleCatalogCacheEntry<Plan[]> | undefined =>
  readEntry(buildPlansKey(serviceTypeId), plansPayload);

export const readCachedServiceTypes = (): ServiceType[] | undefined =>
  readServiceTypesEntry()?.data;

export const readCachedServiceTypesEntry = ():
  | ScheduleCatalogCacheEntry<ServiceType[]>
  | undefined => readServiceTypesEntry();

export const writeCachedServiceTypes = (serviceTypes: ServiceType[]): void => {
  writeEntry(SERVICE_TYPES_KEY, serviceTypesPayload, serviceTypes);
};

export const readCachedPlans = (
  serviceTypeId: string | null
): Plan[] | undefined =>
  serviceTypeId === null || serviceTypeId.length === 0
    ? undefined
    : readPlansEntry(serviceTypeId)?.data;

export const readCachedPlansEntry = (
  serviceTypeId: string | null
): ScheduleCatalogCacheEntry<Plan[]> | undefined =>
  serviceTypeId === null || serviceTypeId.length === 0
    ? undefined
    : readPlansEntry(serviceTypeId);

export const writeCachedPlans = (
  serviceTypeId: string | null,
  plans: Plan[]
): void => {
  if (serviceTypeId === null || serviceTypeId.length === 0) {
    return;
  }
  writeEntry(buildPlansKey(serviceTypeId), plansPayload, plans);
};

export const clearCachedScheduleCatalog = (): void => {
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
    // Ignore storage failures; query invalidation still refreshes live data.
  }
};
