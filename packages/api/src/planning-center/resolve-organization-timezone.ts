import { logger } from "@pcobooster/api/logger";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { recoverPlanningCenterFailure } from "@pcobooster/api/planning-center/recover-failure";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const HIT_TTL_MS = 60 * 60 * 1000;
const MISS_TTL_MS = 2 * 60 * 1000;

const log = logger.for("planning-center/organization-time-zone");

const cache = new Map<string, { timeZone: string; expiresAt: number }>();

export interface OrganizationTimeZoneDependencies {
  readonly catalogService: Pick<
    PlanningCenterCatalogService,
    "getOrganization"
  >;
  readonly cacheScope: string;
  /** When Planning Center does not return a zone, or the read fails with a provider error. */
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
 * Cached per access token / app credentials. Falls back to the configured zone, logged, when the
 * organization has no zone or its read fails with a provider error or an unusable response.
 * Rate-limit and subrequest-limit failures and cancellation fail the caller: a fallback then would
 * cache the wrong zone for every read that follows.
 */
export const resolveOrganizationTimeZone = (
  dependencies: OrganizationTimeZoneDependencies
): Effect.Effect<string, PlanningCenterError> =>
  Effect.suspend(() => {
    const key = dependencies.cacheScope;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
      return Effect.succeed(hit.timeZone);
    }

    return dependencies.catalogService.getOrganization().pipe(
      Effect.map((organization) => {
        const tz = readTimeZoneFromOrganization(organization);
        if (tz === null) {
          log.info(
            { fallbackTimeZone: dependencies.fallbackTimeZone },
            "Organization has no time zone; using the configured time zone"
          );
        }
        return tz;
      }),
      recoverPlanningCenterFailure({
        kinds: ["not-found", "provider-failure", "unusable-response"],
        reason:
          "Organization time zone read failed; using the configured time zone",
        details: { fallbackTimeZone: dependencies.fallbackTimeZone },
        fallback: () => null,
      }),
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
