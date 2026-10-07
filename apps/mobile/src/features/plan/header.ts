import {
  formatCalendarDateLabel,
  formatCalendarDayInTimeZone,
} from "@pcobooster/planning-center-models/calendar";
import type { Plan } from "@pcobooster/planning-center-models/types";

/** Strip the service type prefix from a plan title. */
export const withoutServiceTypePrefix = (
  text: string,
  serviceType: string
): string => {
  const trimmed = text.trim();
  const type = serviceType.trim();
  if (type === "") {
    return trimmed;
  }
  if (trimmed.toLowerCase() === type.toLowerCase()) {
    return "";
  }
  if (!trimmed.toLowerCase().startsWith(type.toLowerCase())) {
    return trimmed;
  }
  const rest = trimmed.slice(type.length).trimStart();
  if (!rest.startsWith("-") && !rest.startsWith(":") && !rest.startsWith("|")) {
    return trimmed;
  }
  const remainder = rest.slice(1).trim();
  return remainder.toLowerCase() === type.toLowerCase() ? "" : remainder;
};

export const planDateLabel = (date: Date, zone: string, now: Date): string =>
  formatCalendarDateLabel(
    date,
    zone,
    formatCalendarDayInTimeZone(date, zone).slice(0, 4) ===
      formatCalendarDayInTimeZone(now, zone).slice(0, 4)
      ? "weekdayMonthDay"
      : "weekdayMonthDayYear"
  );

export const planHeader = (
  plan: Plan | null | undefined,
  serviceTypeName: string,
  zone: string,
  now: Date
) => {
  const type = serviceTypeName.trim();
  const title =
    [
      withoutServiceTypePrefix(plan?.title ?? "", type),
      plan?.seriesTitle?.trim() ?? "",
      type,
    ].find((candidate) => candidate !== "") ?? "";
  const parts: string[] = [];
  if (plan?.sortDate !== undefined) {
    parts.push(planDateLabel(plan.sortDate, zone, now));
  }
  if (type !== "" && type !== title) {
    parts.push(type);
  }
  return { title, subtitle: parts.join(" · ") };
};

/** Select the four nearest plans on the requested side. */
export const listedNeighbors = (
  plans: readonly Plan[],
  planId: string,
  direction: "previous" | "next"
): Plan[] => {
  const index = plans.findIndex((plan) => plan.id === planId);
  if (index === -1) {
    return [];
  }
  return direction === "previous"
    ? plans.slice(0, index).toReversed().slice(0, 4)
    : plans.slice(index + 1, index + 5);
};
