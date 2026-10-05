import {
  getCatalogAdjacentPlans,
  getCatalogOrganization,
  getCatalogPlan,
  getCatalogPlans,
  getCatalogServiceTypes,
  getCatalogTeamPositions,
} from "@pcobooster/api/application/catalog";
import { defineHandler } from "@pcobooster/api/transport/rpc/implementation";
import { readWithPlanningCenter } from "@pcobooster/api/transport/rpc/planning-center-procedure";

const serviceTypes = defineHandler(
  "catalog.serviceTypes",
  async (call) => await readWithPlanningCenter(getCatalogServiceTypes, call)
);

const plans = defineHandler(
  "catalog.plans",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getCatalogPlans(input), call)
);

const plan = defineHandler(
  "catalog.plan",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getCatalogPlan(input), call)
);

const adjacentPlans = defineHandler(
  "catalog.adjacentPlans",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getCatalogAdjacentPlans(input), call)
);

const organization = defineHandler(
  "catalog.organization",
  async (call) => await readWithPlanningCenter(getCatalogOrganization, call)
);

const teamPositions = defineHandler(
  "catalog.teamPositions",
  async ({ input, ...call }) =>
    await readWithPlanningCenter(getCatalogTeamPositions(input), call)
);

export const catalogRouter = {
  serviceTypes,
  plans,
  plan,
  adjacentPlans,
  organization,
  teamPositions,
};
