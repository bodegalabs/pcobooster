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
    handlers.handle("me", () => getPlanningCenterAccessSnapshot)
  ),
  HttpApiBuilder.group(ProductApi, "catalog", (handlers) =>
    handlers
      .handle("serviceTypes", () => getCatalogServiceTypes)
      .handle("organization", () => getCatalogOrganization)
      .handle("plans", ({ params }) => getCatalogPlans(params))
      .handle("plan", ({ params }) => getCatalogPlan(params))
      .handle("adjacentPlans", ({ params, query }) =>
        getCatalogAdjacentPlans({ ...params, ...query })
      )
      .handle("teamPositions", ({ params, query }) =>
        getCatalogTeamPositions({ ...params, ...query })
      )
  )
);
