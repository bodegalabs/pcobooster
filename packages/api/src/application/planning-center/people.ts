import type { RequestPlanningCenterServices } from "@pcobooster/api/application/planning-center-access";
import { Context } from "effect";

/** Planning Center People reads and scheduling writes, bound to the request credential. */
export class PlanningCenterPeople extends Context.Service<
  PlanningCenterPeople,
  RequestPlanningCenterServices["people"]
>()("@pcobooster/api/PlanningCenterPeople") {}
