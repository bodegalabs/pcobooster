const CACHE_VERSION = "v1";
const CACHE_KEY = `worshipadmin:organization-time-zone:${CACHE_VERSION}`;

interface CachedPayload {
  savedAt: number;
  timeZone: string;
}

export interface OrganizationTimeZoneCacheEntry {
  savedAt: number;
  timeZone: string;
}

export function readCachedOrganizationTimeZone():
  | OrganizationTimeZoneCacheEntry
  | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedPayload>;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.savedAt !== "number") return undefined;
    if (!isUsableTimeZone(parsed.timeZone)) return undefined;

    return {
      savedAt: parsed.savedAt,
      timeZone: parsed.timeZone,
    };
  } catch {
    return undefined;
  }
}

export function writeCachedOrganizationTimeZone(timeZone: string) {
  if (typeof window === "undefined") return;
  if (!isUsableTimeZone(timeZone)) return;

  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        timeZone,
      } satisfies CachedPayload)
    );
  } catch {
    // Ignore storage write failures (private mode/quota).
  }
}

export function clearCachedOrganizationTimeZone() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore storage failures; live queries still fetch Planning Center.
  }
}

function isUsableTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}
