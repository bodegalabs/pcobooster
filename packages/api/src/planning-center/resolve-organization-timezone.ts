import { recoverUnlessInterrupted } from "@pcobooster/api/planning-center/recover-unless-interrupted";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const HIT_TTL_MS = 60 * 60 * 1000;
const MISS_TTL_MS = 2 * 60 * 1000;

const cache = new Map<string, { timeZone: string; expiresAt: number }>();

export interface OrganizationTimeZoneDependencies {
  readonly catalogService: Pick<
    PlanningCenterCatalogService,
    "getOrganization"
  >;
  readonly cacheScope: string;
  /** When Planning Center does not return a zone (or the request fails). */
  readonly fallbackTimeZone: string;
}

const readTimeZoneFromOrganization = (org: PCResource): string | null => {
  const raw = org.attributes.time_zone;
  if (!isString(raw)) {
    return null;
  }
  const tz = raw.trim();
  return tz || null;
};

/**
 * Services org `time_zone` (IANA) uses the same calendar semantics Planning Center uses for plans.
 * Cached per access token / app credentials. Falls back to the configured zone only if the API
 * does not expose a zone or the fetch fails; cancellation still stops the caller.
 */
export const resolveOrganizationTimeZone = (
  dependencies: OrganizationTimeZoneDependencies
): Effect.Effect<string> =>
  Effect.suspend(() => {
    const key = dependencies.cacheScope;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
      return Effect.succeed(hit.timeZone);
    }

    return dependencies.catalogService.getOrganization().pipe(
      Effect.map(readTimeZoneFromOrganization),
      recoverUnlessInterrupted(() => null),
      Effect.map((tz) => {
        if (isNonEmptyString(tz)) {
          cache.set(key, { timeZone: tz, expiresAt: now + HIT_TTL_MS });
          return tz;
        }
        const fb = dependencies.fallbackTimeZone;
        cache.set(key, { timeZone: fb, expiresAt: now + MISS_TTL_MS });
        return fb;
      })
    );
  });
