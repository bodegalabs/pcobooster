import { serviceTypeSchema } from "@worship-admin/contracts/catalog";
import type {
  Plan,
  ServiceType,
} from "@worship-admin/planning-center-models/types";
import { z } from "zod";

import { persistedPlanSchema } from "@/lib/persistence-schemas";

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:schedule-catalog:${CACHE_VERSION}:`;
const SERVICE_TYPES_KEY = `${CACHE_KEY_PREFIX}service-types`;
const PLANS_KEY_PREFIX = `${CACHE_KEY_PREFIX}plans:`;

interface CachedPayload<T> {
  savedAt: number;
  data: T;
}

export interface ScheduleCatalogCacheEntry<T> {
  savedAt: number;
  data: T;
}

const serviceTypesPayloadSchema = z.object({
  savedAt: z.number(),
  data: z.array(serviceTypeSchema),
});

const plansPayloadSchema = z.object({
  savedAt: z.number(),
  data: z.array(persistedPlanSchema),
});

const buildPlansKey = (serviceTypeId: string): string =>
  `${PLANS_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}`;

const readServiceTypesEntry = ():
  | ScheduleCatalogCacheEntry<ServiceType[]>
  | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }
  try {
    const raw = storage.getItem(SERVICE_TYPES_KEY);
    if (raw === null) {
      return undefined;
    }
    const parsed = serviceTypesPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

const readPlansEntry = (
  serviceTypeId: string
): ScheduleCatalogCacheEntry<Plan[]> | undefined => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return undefined;
  }
  try {
    const raw = storage.getItem(buildPlansKey(serviceTypeId));
    if (raw === null) {
      return undefined;
    }
    const parsed = plansPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const readCachedServiceTypes = (): ServiceType[] | undefined =>
  readServiceTypesEntry()?.data;

export const readCachedServiceTypesEntry = ():
  | ScheduleCatalogCacheEntry<ServiceType[]>
  | undefined => readServiceTypesEntry();

export const writeCachedServiceTypes = (serviceTypes: ServiceType[]): void => {
  const storage = globalThis.window?.localStorage;
  if (storage === undefined) {
    return;
  }
  try {
    storage.setItem(
      SERVICE_TYPES_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        data: serviceTypes,
      } satisfies CachedPayload<ServiceType[]>)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
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
  const storage = globalThis.window?.localStorage;
  if (
    serviceTypeId === null ||
    serviceTypeId.length === 0 ||
    storage === undefined
  ) {
    return;
  }
  try {
    storage.setItem(
      buildPlansKey(serviceTypeId),
      JSON.stringify({
        savedAt: Date.now(),
        data: plans,
      } satisfies CachedPayload<Plan[]>)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
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
