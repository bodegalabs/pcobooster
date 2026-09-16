export interface MyScheduledPlansData {
  planIds: string[];
}

const CACHE_VERSION = "v1";
const CACHE_KEY_PREFIX = `worshipadmin:my-scheduled-plans:${CACHE_VERSION}:`;

interface CachedPayload {
  savedAt: number;
  data: MyScheduledPlansData;
}

export interface MyScheduledPlansCacheEntry {
  savedAt: number;
  data: MyScheduledPlansData;
}

export function readCachedMyScheduledPlans(
  planIdsKey: string
): MyScheduledPlansCacheEntry | undefined {
  if (!planIdsKey || typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(buildCacheKey(planIdsKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isMyScheduledPlansData(parsed.data)) return undefined;

    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
    };
  } catch {
    return undefined;
  }
}

export function writeCachedMyScheduledPlans(
  planIdsKey: string,
  data: MyScheduledPlansData
) {
  if (!planIdsKey || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      buildCacheKey(planIdsKey),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedMyScheduledPlans() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures; live queries will still fetch Planning Center.
  }
}

function buildCacheKey(planIdsKey: string) {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(planIdsKey)}`;
}

function isMyScheduledPlansData(value: unknown): value is MyScheduledPlansData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<MyScheduledPlansData>;
  return (
    Array.isArray(data.planIds) &&
    data.planIds.every((id) => typeof id === "string")
  );
}
