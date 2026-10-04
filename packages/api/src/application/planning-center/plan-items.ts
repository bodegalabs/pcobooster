import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { Context } from "effect";

export class PlanningCenterPlanItems extends Context.Service<
  PlanningCenterPlanItems,
  RequestPlanningCenterServices["planItems"]
>()("@pcobooster/api/PlanningCenterPlanItems") {}
