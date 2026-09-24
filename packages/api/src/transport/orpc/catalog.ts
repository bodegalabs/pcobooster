import {
  getCatalogOrganization,
  getCatalogPlans,
  getCatalogServiceTypes,
  getCatalogTeamPositions,
} from "@pcobooster/api/application/catalog";
import { rpc } from "@pcobooster/api/transport/orpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/orpc/planning-center-procedure";

const serviceTypes = rpc.catalog.serviceTypes.handler(
  async (call) => await readWithPlanningCenter(getCatalogServiceTypes, call)
);

const plans = rpc.catalog.plans.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getCatalogPlans(input), call)
);

const organization = rpc.catalog.organization.handler(
  async (call) => await readWithPlanningCenter(getCatalogOrganization, call)
);

const teamPositions = rpc.catalog.teamPositions.handler(
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getCatalogTeamPositions(input), call)
);

export const catalogRouter = {
  serviceTypes,
  plans,
  organization,
  teamPositions,
};
