import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { Context } from "effect";

export class PlanningCenterSongs extends Context.Service<
  PlanningCenterSongs,
  RequestPlanningCenterServices["songs"]
>()("@pcobooster/api/PlanningCenterSongs") {}
