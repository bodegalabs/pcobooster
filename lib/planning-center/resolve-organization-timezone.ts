import { getPlanningCenterRequestAccessToken } from "@/lib/planning-center/request-auth-context";
import { planningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import type { PCResource } from "@/lib/types";

const HIT_TTL_MS = 60 * 60 * 1000;
const MISS_TTL_MS = 2 * 60 * 1000;

const cache = new Map<string, { timeZone: string; expiresAt: number }>();

function cacheKey(): string {
  return getPlanningCenterRequestAccessToken() ?? "__application__";
}

/** When Planning Center does not return a zone (or the request fails). */
function configuredFallbackTimeZone(): string {
  return (
    process.env.PLANNING_CENTER_TIME_ZONE?.trim() ||
    process.env.NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE?.trim() ||
    "America/Los_Angeles"
  );
}

function readTimeZoneFromOrganization(org: PCResource): string | null {
  const raw = org.attributes.time_zone;
  if (typeof raw !== "string") return null;
  const tz = raw.trim();
  return tz || null;
}

/**
 * Services org `time_zone` (IANA) — the same calendar semantics Planning Center uses for plans.
 * Cached per access token / app credentials. Falls back to env (then Los Angeles) only if the API
 * does not expose a zone or the fetch fails.
 */
export async function resolveOrganizationTimeZone(): Promise<string> {
  const key = cacheKey();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.timeZone;
  }

  try {
    const org = await planningCenterCatalogService.getOrganization();
    const tz = readTimeZoneFromOrganization(org);
    if (tz) {
      cache.set(key, { timeZone: tz, expiresAt: now + HIT_TTL_MS });
      return tz;
    }
  } catch {
    // fall through to fallback
  }

  const fb = configuredFallbackTimeZone();
  cache.set(key, { timeZone: fb, expiresAt: now + MISS_TTL_MS });
  return fb;
}
