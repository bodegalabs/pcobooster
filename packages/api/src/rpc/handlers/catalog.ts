import { getCatalogPlan } from "@pcobooster/api/application/catalog";
import { catalogRpc } from "@pcobooster/contracts/rpc/catalog";

export const CatalogHandlers = catalogRpc.toLayer({
  "catalog.plan": getCatalogPlan,
});
