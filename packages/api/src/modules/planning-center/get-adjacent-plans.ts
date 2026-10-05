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

/**
 * Plans fetched to find the neighbors. The window starts a day wide on the near side, so
 * the page also holds this plan and its same-day services; Planning Center slows down
 * sharply with page size (seconds at 100), so the page stays small.
 */
export const ADJACENT_PLANS_PAGE_SIZE = 8;

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

/** Plans listed on each side of the open plan in the plan header's menu. */
export const ADJACENT_PLANS_LIMIT = 4;

/**
 * Up to `ADJACENT_PLANS_LIMIT` plans before or after one plan in its service type, nearest
 * first, in two requests: the plan for its date, then one page of plans around that date.
 * Planning Center's before and after filters take whole days, so the window starts a day
 * wide on the near side and neighbors are picked by exact time, which keeps same-day
 * services in order.
 */
export const getAdjacentPlans = (
  serviceTypeId: string,
  planId: string,
  direction: PlanDirection,
  dependencies: AdjacentPlanDependencies
): Effect.Effect<Plan[], PlanningCenterError> =>
  Effect.gen(function* findAdjacentPlans() {
    const current = yield* getPlanDetails(serviceTypeId, planId, dependencies);
    const currentTime = current?.sortDate?.getTime();
    if (current === null || currentTime === undefined) {
      return [];
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
            before: addCalendarDaysToDayKey(dayKey, 1),
          }
        : {
            filter: "after",
            after: addCalendarDaysToDayKey(dayKey, -1),
          },
      direction === "previous" ? "-sort_date" : "sort_date",
      ADJACENT_PLANS_PAGE_SIZE
    );
    // `toPlans` sorts oldest first.
    const candidates = toPlans(rawPlans).filter((plan) => {
      const time = plan.sortDate?.getTime();
      if (time === undefined || plan.id === planId) {
        return false;
      }
      return direction === "previous" ? time < currentTime : time > currentTime;
    });
    const nearestFirst =
      direction === "previous" ? candidates.toReversed() : candidates;
    return nearestFirst.slice(0, ADJACENT_PLANS_LIMIT);
  });
