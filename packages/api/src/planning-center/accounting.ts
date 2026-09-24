import type { PlanningCenterRequestAccounting } from "@pcobooster/api/planning-center/request-accounting";
import { Context, Effect, Option } from "effect";

/**
 * The accounting for the current oRPC procedure. Transport provides it per
 * execution; code running outside a procedure (scripts, unit tests) has none
 * and is simply not counted.
 */
export class PlanningCenterAccounting extends Context.Service<
  PlanningCenterAccounting,
  PlanningCenterRequestAccounting
>()("@pcobooster/api/PlanningCenterAccounting") {}

/** Planning Center requests sent so far by this procedure, if it is counted. */
export const currentPlanningCenterRequestCount: Effect.Effect<
  number | undefined
> = Effect.map(Effect.serviceOption(PlanningCenterAccounting), (accounting) =>
  Option.isSome(accounting) ? accounting.value.requestCount : undefined
);
