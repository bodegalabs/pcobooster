import { orgCalendarDaysBetween } from "@pcobooster/planning-center-models/calendar";
import type { Plan } from "@pcobooster/planning-center-models/types";
import { Schema } from "effect";

export const serviceFiltersSchema = Schema.Struct({
  onlyMine: Schema.Boolean,
  serviceTypeIds: Schema.NullOr(Schema.Array(Schema.String)),
  dateWindow: Schema.Literals([
    "All upcoming",
    "Recent",
    "Next 14 days",
    "Next 30 days",
    "Next 60 days",
  ]),
});
export type ServiceFilters = typeof serviceFiltersSchema.Type;
export const defaultServiceFilters: ServiceFilters = {
  onlyMine: false,
  serviceTypeIds: null,
  dateWindow: "Next 60 days",
};
const windowDays = {
  "All upcoming": Infinity,
  Recent: 0,
  "Next 14 days": 14,
  "Next 30 days": 30,
  "Next 60 days": 60,
} as const;

export const filterServicePlans = (
  plans: readonly Plan[],
  filters: ServiceFilters,
  search: string,
  mine: ReadonlySet<string>,
  now: Date,
  timeZone: string
): Plan[] => {
  const term = search.trim().toLowerCase();
  return plans.filter((plan) => {
    if (filters.onlyMine && !mine.has(plan.id)) {
      return false;
    }
    if (term !== "" && !plan.title.toLowerCase().includes(term)) {
      return false;
    }
    if (plan.sortDate === null || plan.sortDate === undefined) {
      return false;
    }
    const delta = orgCalendarDaysBetween(now, plan.sortDate, timeZone);
    if (filters.dateWindow === "Recent") {
      return delta < 0;
    }
    return delta >= 0 && delta <= windowDays[filters.dateWindow];
  });
};
