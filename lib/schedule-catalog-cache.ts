import type { Plan, ServiceType } from "@/lib/types";

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

export function readCachedServiceTypes(): ServiceType[] | undefined {
  return readCachedServiceTypesEntry()?.data;
}

export function readCachedServiceTypesEntry():
  | ScheduleCatalogCacheEntry<ServiceType[]>
  | undefined {
  return readCache<ServiceType[]>(SERVICE_TYPES_KEY, isServiceTypeArray);
}

export function writeCachedServiceTypes(serviceTypes: ServiceType[]) {
  writeCache(SERVICE_TYPES_KEY, serviceTypes);
}

export function readCachedPlans(
  serviceTypeId: string | null
): Plan[] | undefined {
  return readCachedPlansEntry(serviceTypeId)?.data;
}

export function readCachedPlansEntry(
  serviceTypeId: string | null
): ScheduleCatalogCacheEntry<Plan[]> | undefined {
  if (!serviceTypeId) return undefined;
  const cached = readCache<Plan[]>(buildPlansKey(serviceTypeId), isPlanArray);
  if (!cached) return undefined;

  return {
    savedAt: cached.savedAt,
    data: cached.data.map((plan) => ({
      ...plan,
      createdAt: new Date(plan.createdAt),
      sortDate: plan.sortDate ? new Date(plan.sortDate) : undefined,
    })),
  };
}

export function writeCachedPlans(serviceTypeId: string | null, plans: Plan[]) {
  if (!serviceTypeId) return;
  writeCache(buildPlansKey(serviceTypeId), plans);
}

export function clearCachedScheduleCatalog() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; query invalidation still refreshes live data.
  }
}

function buildPlansKey(serviceTypeId: string) {
  return `${PLANS_KEY_PREFIX}${encodeURIComponent(serviceTypeId)}`;
}

function readCache<T>(
  key: string,
  validate: (value: unknown) => value is T
): ScheduleCatalogCacheEntry<T> | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload<unknown>>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!validate(parsed.data)) return undefined;
    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

function writeCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload<T>)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

function isServiceTypeArray(value: unknown): value is ServiceType[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<ServiceType>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.sequence === "number"
      );
    })
  );
}

function isPlanArray(value: unknown): value is Plan[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<Record<keyof Plan, unknown>>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.title === "string" &&
        isOptionalString(candidate.seriesTitle) &&
        isOptionalString(candidate.seriesId) &&
        isOptionalString(candidate.planningCenterUrl) &&
        isDateLike(candidate.createdAt) &&
        (candidate.sortDate === undefined || isDateLike(candidate.sortDate))
      );
    })
  );
}

function isOptionalString(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}

function isDateLike(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return false;
  return !Number.isNaN(new Date(value).getTime());
}
