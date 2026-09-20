import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";
import { planningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import type { PlanningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@worship-admin/planning-center-models/calendar";
import {
  isNonEmptyString,
  isString,
} from "@worship-admin/planning-center-models/json";
import type { Plan } from "@worship-admin/planning-center-models/types";

interface GetPlansDependencies {
  plansService: Pick<PlanningCenterPlansService, "getPlansInDateRange">;
  resolveTimeZone: () => Promise<string>;
}

const defaultDependencies: GetPlansDependencies = {
  plansService: planningCenterPlansService,
  resolveTimeZone: resolveOrganizationTimeZone,
};

export const getPlansForServiceType = async (
  serviceTypeId: string,
  dependencies: GetPlansDependencies = defaultDependencies
): Promise<Plan[]> => {
  const orgTz = await dependencies.resolveTimeZone();
  const afterKey = formatCalendarDayInTimeZone(new Date(), orgTz);
  const beforeKey = addCalendarDaysToDayKey(afterKey, 60, orgTz);

  const rawPlans = await dependencies.plansService.getPlansInDateRange(
    serviceTypeId,
    afterKey,
    beforeKey,
    orgTz
  );

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
