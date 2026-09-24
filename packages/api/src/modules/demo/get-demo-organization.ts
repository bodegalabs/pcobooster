import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import { cachedRead } from "@pcobooster/api/planning-center/services/cached-read";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import { Effect } from "effect";

const ORGANIZATION_TTL_MS = 10 * 60 * 1000;
const organizationCache = new PlanningCenterReadCache<DemoOrganization>();

export interface DemoOrganization {
  readonly id: string;
  readonly name: string;
}

/** The demo organization's name labels the account menu for every visitor. */
export const getDemoOrganization = (services: {
  readonly catalog: Pick<PlanningCenterCatalogService, "getOrganization">;
  readonly core: { getCacheScope: () => string };
}): Effect.Effect<DemoOrganization, PlanningCenterError> =>
  cachedRead(
    organizationCache,
    services.core.getCacheScope(),
    ORGANIZATION_TTL_MS,
    () =>
      Effect.map(services.catalog.getOrganization(), (organization) => {
        const { name } = organization.attributes;
        return {
          id: organization.id,
          name: isNonEmptyString(name) ? name : "Demo organization",
        };
      })
  );
