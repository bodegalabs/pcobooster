import {
  getCatalogOrganization,
  getCatalogPlans,
  getCatalogServiceTypes,
  getCatalogTeamPositions,
} from "@pcobooster/api/application/catalog";
import { withPlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { executeApplicationEffect } from "@pcobooster/api/transport/orpc/execute";
import {
  applicationRuntime,
  rpc,
} from "@pcobooster/api/transport/orpc/implementation";

const serviceTypes = rpc.catalog.serviceTypes.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogServiceTypes),
      context,
      signal
    )
);

const plans = rpc.catalog.plans.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogPlans(input)),
      context,
      signal
    )
);

const organization = rpc.catalog.organization.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogOrganization),
      context,
      signal
    )
);

const teamPositions = rpc.catalog.teamPositions.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogTeamPositions(input)),
      context,
      signal
    )
);

export const catalogRouter = {
  serviceTypes,
  plans,
  organization,
  teamPositions,
};
