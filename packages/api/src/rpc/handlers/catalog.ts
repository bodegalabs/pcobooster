import { getPlanningCenterAccessSnapshot } from "@pcobooster/api/application/access";
import {
  getCatalogAdjacentPlans,
  getCatalogOrganization,
  getCatalogPlan,
  getCatalogPlans,
  getCatalogServiceTypes,
  getCatalogTeamPositions,
} from "@pcobooster/api/application/catalog";
import { accessRpc } from "@pcobooster/contracts/rpc/access";
import { catalogRpc } from "@pcobooster/contracts/rpc/catalog";
import { Layer } from "effect";

export const CatalogHandlers = Layer.mergeAll(
  accessRpc.toLayer({
    "access.me": () => getPlanningCenterAccessSnapshot,
  }),
  catalogRpc.toLayer({
    "catalog.serviceTypes": () => getCatalogServiceTypes,
    "catalog.plans": getCatalogPlans,
    "catalog.plan": getCatalogPlan,
    "catalog.adjacentPlans": getCatalogAdjacentPlans,
    "catalog.organization": () => getCatalogOrganization,
    "catalog.teamPositions": getCatalogTeamPositions,
  })
);
