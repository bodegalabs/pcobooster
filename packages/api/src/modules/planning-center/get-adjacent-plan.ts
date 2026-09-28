import { toPlans } from "@pcobooster/api/modules/planning-center/get-plans";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import type { Plan } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export type PlanDirection = "previous" | "next";

export interface AdjacentPlanDependencies {
  plansService: Pick<
    PlanningCenterPlansService,
    "getPlanForServiceTypeWithSeries" | "getPlansPage"
  >;
  resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
}

/** One plan's header details (title, series, date), for plans outside the upcoming list. */
export const getPlanDetails = (
  serviceTypeId: string,
  planId: string,
  dependencies: Pick<AdjacentPlanDependencies, "plansService">
): Effect.Effect<Plan | null, PlanningCenterError> =>
  Effect.map(
    dependencies.plansService.getPlanForServiceTypeWithSeries(
      serviceTypeId,
      planId
    ),
    ({ data }) => toPlans([data])[0] ?? null
  );

/**
 * The plan just before or after one plan in its service type, in two requests: the plan
 * for its date, then one page of plans around that date. Planning Center's before and
 * after filters take whole days, so the window starts a day wide on the near side and
 * the neighbor is picked by exact time, which keeps same-day services in order.
 */
export const getAdjacentPlan = (
  serviceTypeId: string,
  planId: string,
  direction: PlanDirection,
  dependencies: AdjacentPlanDependencies
): Effect.Effect<Plan | null, PlanningCenterError> =>
  Effect.gen(function* findAdjacentPlan() {
    const current = yield* getPlanDetails(serviceTypeId, planId, dependencies);
    const currentTime = current?.sortDate?.getTime();
    if (current === null || currentTime === undefined) {
      return null;
    }
    const timeZone = yield* dependencies.resolveTimeZone;
    const dayKey = formatCalendarDayInTimeZone(
      current.sortDate ?? new Date(currentTime),
      timeZone
    );
    // Nearest first: newest plans before this one, or oldest plans after it.
    const rawPlans = yield* dependencies.plansService.getPlansPage(
      serviceTypeId,
      direction === "previous"
        ? {
            filter: "before",
            before: addCalendarDaysToDayKey(dayKey, 1, timeZone),
          }
        : {
            filter: "after",
            after: addCalendarDaysToDayKey(dayKey, -1, timeZone),
          },
      direction === "previous" ? "-sort_date" : "sort_date"
    );
    const candidates = toPlans(rawPlans).filter((plan) => {
      const time = plan.sortDate?.getTime();
      if (time === undefined || plan.id === planId) {
        return false;
      }
      return direction === "previous" ? time < currentTime : time > currentTime;
    });
    return (
      (direction === "previous" ? candidates.at(-1) : candidates[0]) ?? null
    );
  });
