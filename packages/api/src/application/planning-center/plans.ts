import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { Context } from "effect";

export class PlanningCenterPlans extends Context.Service<
  PlanningCenterPlans,
  RequestPlanningCenterServices["plans"]
>()("@pcobooster/api/PlanningCenterPlans") {}
