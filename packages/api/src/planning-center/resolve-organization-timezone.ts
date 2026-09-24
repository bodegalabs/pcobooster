import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";

const HIT_TTL_MS = 60 * 60 * 1000;
const MISS_TTL_MS = 2 * 60 * 1000;

const cache = new Map<string, { timeZone: string; expiresAt: number }>();

export interface OrganizationTimeZoneDependencies {
  readonly catalogService: Pick<
    PlanningCenterCatalogService,
    "getOrganization"
  >;
  readonly cacheScope: string;
  readonly signal?: AbortSignal;
}

/** When Planning Center does not return a zone (or the request fails). */
const configuredFallbackTimeZone = (): string => {
  const configured = process.env.PLANNING_CENTER_TIME_ZONE?.trim();
  return isNonEmptyString(configured) ? configured : "America/Los_Angeles";
};

const readTimeZoneFromOrganization = (org: PCResource): string | null => {
  const raw = org.attributes.time_zone;
  if (!isString(raw)) {
    return null;
  }
  const tz = raw.trim();
  return tz || null;
};

/**
 * Services org `time_zone` (IANA) — the same calendar semantics Planning Center uses for plans.
 * Cached per access token / app credentials. Falls back to env (then Los Angeles) only if the API
 * does not expose a zone or the fetch fails.
 */
export const resolveOrganizationTimeZone = async (
  dependencies: OrganizationTimeZoneDependencies
): Promise<string> => {
  const key = dependencies.cacheScope;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.timeZone;
  }

  try {
    const org = await dependencies.catalogService.getOrganization(
      dependencies.signal
    );
    const tz = readTimeZoneFromOrganization(org);
    if (isNonEmptyString(tz)) {
      cache.set(key, { timeZone: tz, expiresAt: now + HIT_TTL_MS });
      return tz;
    }
  } catch (error) {
    if (dependencies.signal?.aborted === true) {
      throw error;
    }
    // fall through to fallback
  }

  const fb = configuredFallbackTimeZone();
  cache.set(key, { timeZone: fb, expiresAt: now + MISS_TTL_MS });
  return fb;
};
