import {
  addCalendarDaysToDayKey,
  formatCalendarDayInTimeZone,
} from "@/lib/planning-center/org-calendar";
import { resolveOrganizationTimeZone } from "@/lib/planning-center/resolve-organization-timezone";
import { planningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import type { Plan, RawPlan } from "@/lib/types";

export async function getPlansForServiceType(
  serviceTypeId: string
): Promise<Plan[]> {
  const orgTz = await resolveOrganizationTimeZone();
  const afterKey = formatCalendarDayInTimeZone(new Date(), orgTz);
  const beforeKey = addCalendarDaysToDayKey(afterKey, 60, orgTz);

  const rawPlans = await planningCenterPlansService.getPlansInDateRange(
    serviceTypeId,
    afterKey,
    beforeKey
  );

  const plans = rawPlans
    .map((raw) => {
      const plan = raw as unknown as RawPlan;
      const sortDateStr = plan.attributes.sort_date as string | undefined;
      if (!sortDateStr) return null;

      const sortDate = new Date(sortDateStr);
      if (isNaN(sortDate.getTime())) return null;

      const parsedPlan: Plan = {
        id: plan.id,
        title: plan.attributes.title as string,
        seriesTitle: plan.attributes.series_title as string | undefined,
        seriesId:
          !Array.isArray(plan.relationships?.series?.data) &&
          plan.relationships?.series?.data
            ? plan.relationships.series.data.id
            : null,
        planningCenterUrl: plan.attributes.planning_center_url ?? null,
        createdAt: new Date(plan.attributes.created_at as string),
        sortDate,
      };
      return parsedPlan;
    })
    .filter((plan): plan is Plan => plan !== null);

  plans.sort(
    (a, b) => (a.sortDate?.getTime() || 0) - (b.sortDate?.getTime() || 0)
  );
  return plans;
}
