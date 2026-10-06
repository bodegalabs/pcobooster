import { getPlanningCenterAccessSnapshot } from "@pcobooster/api/application/access";
import {
  getCatalogAdjacentPlans,
  getCatalogOrganization,
  getCatalogPlan,
  getCatalogPlans,
  getCatalogServiceTypes,
  getCatalogTeamPositions,
} from "@pcobooster/api/application/catalog";
import { ProductApi } from "@pcobooster/contracts/http/api";
import { Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const CatalogHandlers = Layer.mergeAll(
  HttpApiBuilder.group(ProductApi, "access", (handlers) =>
    handlers.handle("access.me", () => getPlanningCenterAccessSnapshot)
  ),
  HttpApiBuilder.group(ProductApi, "catalog", (handlers) =>
    handlers
      .handle("catalog.serviceTypes", () => getCatalogServiceTypes)
      .handle("catalog.organization", () => getCatalogOrganization)
      .handle("catalog.plans", ({ params }) => getCatalogPlans(params))
      .handle("catalog.plan", ({ params }) => getCatalogPlan(params))
      .handle("catalog.adjacentPlans", ({ params, query }) =>
        getCatalogAdjacentPlans({ ...params, ...query })
      )
      .handle("catalog.teamPositions", ({ params, query }) =>
        getCatalogTeamPositions({ ...params, ...query })
      )
  )
);
