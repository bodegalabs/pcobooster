import { getPlanningCenterRequestAccessToken } from "@worship-admin/api/planning-center/request-auth-context";
import { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import type { PlanningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import {
  isNonEmptyString,
  isString,
} from "@worship-admin/planning-center-models/json";
import type { PCResource } from "@worship-admin/planning-center-models/types";

const HIT_TTL_MS = 60 * 60 * 1000;
const MISS_TTL_MS = 2 * 60 * 1000;

const cache = new Map<string, { timeZone: string; expiresAt: number }>();

const legacyCacheScope = (): string =>
  getPlanningCenterRequestAccessToken() ?? "__application__";

export interface OrganizationTimeZoneDependencies {
  readonly catalogService: Pick<
    PlanningCenterCatalogService,
    "getOrganization"
  >;
  /**
   * Converted Effect programs pass a request-owned scope. The legacy default
   * keeps existing REST callers working until they are migrated.
   */
  readonly cacheScope?: string;
}

const defaultDependencies: OrganizationTimeZoneDependencies = {
  catalogService: planningCenterCatalogService,
};

/** When Planning Center does not return a zone (or the request fails). */
const configuredFallbackTimeZone = (): string =>
  process.env.PLANNING_CENTER_TIME_ZONE?.trim() ??
  process.env.NEXT_PUBLIC_PLANNING_CENTER_TIME_ZONE?.trim() ??
  "America/Los_Angeles";

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
  dependencies: OrganizationTimeZoneDependencies = defaultDependencies
): Promise<string> => {
  const key = dependencies.cacheScope ?? legacyCacheScope();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.timeZone;
  }

  try {
    const org = await dependencies.catalogService.getOrganization();
    const tz = readTimeZoneFromOrganization(org);
    if (isNonEmptyString(tz)) {
      cache.set(key, { timeZone: tz, expiresAt: now + HIT_TTL_MS });
      return tz;
    }
  } catch {
    // fall through to fallback
  }

  const fb = configuredFallbackTimeZone();
  cache.set(key, { timeZone: fb, expiresAt: now + MISS_TTL_MS });
  return fb;
};
