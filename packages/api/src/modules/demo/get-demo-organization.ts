import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import { PlanningCenterReadCache } from "@pcobooster/api/planning-center/services/read-cache";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

const ORGANIZATION_TTL_MS = 10 * 60 * 1000;
const organizationCache = new PlanningCenterReadCache<DemoOrganization>();

export interface DemoOrganization {
  readonly id: string;
  readonly name: string;
}

/** The demo organization's name labels the account menu for every visitor. */
export const getDemoOrganization = async (
  services: {
    readonly catalog: Pick<PlanningCenterCatalogService, "getOrganization">;
    readonly core: { getCacheScope: () => string };
  },
  signal?: AbortSignal
): Promise<DemoOrganization> =>
  await organizationCache.get(
    services.core.getCacheScope(),
    ORGANIZATION_TTL_MS,
    async (loadSignal) => {
      const organization = await services.catalog.getOrganization(loadSignal);
      const { name } = organization.attributes;
      return {
        id: organization.id,
        name: isNonEmptyString(name) ? name : "Demo organization",
      };
    },
    signal
  );
