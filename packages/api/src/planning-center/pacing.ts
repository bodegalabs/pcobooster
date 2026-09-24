import type { PlanningCenterRatePacer } from "@pcobooster/api/planning-center/rate-pacer";
import { Context } from "effect";

/**
 * The isolate's pacer. The application runtime layer provides one instance;
 * without it (scripts, most unit tests) requests are not paced.
 */
export class PlanningCenterPacing extends Context.Service<
  PlanningCenterPacing,
  PlanningCenterRatePacer
>()("@pcobooster/api/PlanningCenterPacing") {}
