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
import type { HttpClient } from "effect/unstable/http/HttpClient";

const createServicesForClient = (
  core: PlanningCenterCoreClient,
  fallbackTimeZone: string
) => {
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
      resolveOrganizationTimeZone({
        cacheScope: core.getCacheScope(),
        catalogService: catalog,
        fallbackTimeZone,
      }),
      planningCenterPlansServiceCaches
    ),
    songs: new PlanningCenterSongsService(
      core,
      planningCenterSongsServiceCaches
    ),
  };
};

export const createPlanningCenterServices = (
  accessToken: string,
  fallbackTimeZone: string,
  httpClient: HttpClient
) =>
  createServicesForClient(
    new PlanningCenterCoreClient(
      { kind: "bearer", accessToken },
      { httpClient }
    ),
    fallbackTimeZone
  );

export const createBasicPlanningCenterServices = (
  token: PlanningCenterPersonalAccessToken,
  fallbackTimeZone: string,
  httpClient: HttpClient
) =>
  createServicesForClient(
    createBasicPlanningCenterClient(token, httpClient),
    fallbackTimeZone
  );

/** Demo services can read the demo organization but never write to it. */
export const createReadOnlyPlanningCenterServices = (
  token: PlanningCenterPersonalAccessToken,
  fallbackTimeZone: string,
  httpClient: HttpClient
) =>
  createServicesForClient(
    new PlanningCenterCoreClient(
      { kind: "basic", ...token },
      { httpClient, readOnly: true }
    ),
    fallbackTimeZone
  );
