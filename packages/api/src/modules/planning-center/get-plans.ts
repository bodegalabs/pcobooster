import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPlansService } from "@pcobooster/api/planning-center/services/plans-service";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import {
  isNonEmptyString,
  isString,
} from "@pcobooster/planning-center-models/json";
import type {
  PCResource,
  Plan,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export interface GetPlansDependencies {
  plansService: Pick<PlanningCenterPlansService, "getPlansInDateRange">;
  resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
}

const toPlans = (rawPlans: PCResource[]): Plan[] => {
  const plans: Plan[] = [];
  for (const raw of rawPlans) {
    const sortDateStr = raw.attributes.sort_date;
    if (!isNonEmptyString(sortDateStr)) {
      continue;
    }
    const sortDate = new Date(sortDateStr);
    if (Number.isNaN(sortDate.getTime())) {
      continue;
    }
    const createdAtRaw = raw.attributes.created_at;
    const createdAt = isString(createdAtRaw)
      ? new Date(createdAtRaw)
      : sortDate;
    const seriesRel = raw.relationships?.series?.data;
    const seriesId = Array.isArray(seriesRel)
      ? seriesRel[0]?.id
      : seriesRel?.id;
    plans.push({
      id: raw.id,
      title: isString(raw.attributes.title) ? raw.attributes.title : "",
      seriesTitle: isString(raw.attributes.series_title)
        ? raw.attributes.series_title
        : undefined,
      seriesId: seriesId ?? null,
      planningCenterUrl: isString(raw.attributes.planning_center_url)
        ? raw.attributes.planning_center_url
        : null,
      createdAt: Number.isNaN(createdAt.getTime()) ? sortDate : createdAt,
      sortDate,
    });
  }

  plans.sort(
    (a, b) => (a.sortDate?.getTime() ?? 0) - (b.sortDate?.getTime() ?? 0)
  );
  return plans;
};

export const getPlansForServiceType = (
  serviceTypeId: string,
  dependencies: GetPlansDependencies
): Effect.Effect<Plan[], PlanningCenterError> =>
  Effect.gen(function* getPlans() {
    const orgTz = yield* dependencies.resolveTimeZone;
    const afterKey = formatCalendarDayInTimeZone(new Date(), orgTz);
    const beforeKey = addCalendarDaysToDayKey(afterKey, 60, orgTz);

    const rawPlans = yield* dependencies.plansService.getPlansInDateRange(
      serviceTypeId,
      afterKey,
      beforeKey,
      orgTz
    );
    return toPlans(rawPlans);
  });
