import {
  PlanningCenterCoreClient,
  createBasicPlanningCenterClient,
} from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPersonalAccessToken } from "@pcobooster/api/planning-center/core-client";
import { resolveOrganizationTimeZone } from "@pcobooster/api/planning-center/resolve-organization-timezone";
import {
  planningCenterCatalogServiceCaches,
  PlanningCenterCatalogService,
} from "@pcobooster/api/planning-center/services/catalog-service";
import {
  planningCenterPeopleServiceCaches,
  PlanningCenterPeopleService,
} from "@pcobooster/api/planning-center/services/people-service";
import {
  planningCenterPlanItemsServiceCaches,
  PlanningCenterPlanItemsService,
} from "@pcobooster/api/planning-center/services/plan-items-service";
import {
  planningCenterPlansServiceCaches,
  PlanningCenterPlansService,
} from "@pcobooster/api/planning-center/services/plans-service";
import {
  planningCenterSongsServiceCaches,
  PlanningCenterSongsService,
} from "@pcobooster/api/planning-center/services/songs-service";

const createServicesForClient = (core: PlanningCenterCoreClient) => {
  const catalog = new PlanningCenterCatalogService(
    core,
    planningCenterCatalogServiceCaches
  );

  return {
    core,
    catalog,
    people: new PlanningCenterPeopleService(
      core,
      planningCenterPeopleServiceCaches
    ),
    planItems: new PlanningCenterPlanItemsService(
      core,
      planningCenterPlanItemsServiceCaches
    ),
    plans: new PlanningCenterPlansService(
      core,
      async (signal) =>
        await resolveOrganizationTimeZone({
          cacheScope: core.getCacheScope(),
          catalogService: catalog,
          signal,
        }),
      planningCenterPlansServiceCaches
    ),
    songs: new PlanningCenterSongsService(
      core,
      planningCenterSongsServiceCaches
    ),
  };
};

export const createPlanningCenterServices = (accessToken: string) =>
  createServicesForClient(
    new PlanningCenterCoreClient({ kind: "bearer", accessToken })
  );

export const createBasicPlanningCenterServices = () =>
  createServicesForClient(createBasicPlanningCenterClient());

/** Demo services can read the demo organization but never write to it. */
export const createReadOnlyPlanningCenterServices = (
  token: PlanningCenterPersonalAccessToken
) =>
  createServicesForClient(
    new PlanningCenterCoreClient(
      { kind: "basic", ...token },
      { readOnly: true }
    )
  );
