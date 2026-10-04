import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { Context } from "effect";

export class PlanningCenterCatalog extends Context.Service<
  PlanningCenterCatalog,
  RequestPlanningCenterServices["catalog"]
>()("@pcobooster/api/PlanningCenterCatalog") {}
