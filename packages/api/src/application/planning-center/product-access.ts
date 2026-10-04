import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { Context } from "effect";

/** The signed-in person's own permissions in each Planning Center product. */
export class PlanningCenterProductAccess extends Context.Service<
  PlanningCenterProductAccess,
  RequestPlanningCenterServices["access"]
>()("@pcobooster/api/PlanningCenterProductAccess") {}
