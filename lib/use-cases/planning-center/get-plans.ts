import { isNonEmptyString, isString } from "@/lib/json";
import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@/lib/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@/lib/planning-center/resolve-organization-timezone";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import type { PlanningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import type { Plan } from "@/lib/types";

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
    beforeKey
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
