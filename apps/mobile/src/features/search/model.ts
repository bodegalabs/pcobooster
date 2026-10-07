import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { formatPlanDate } from "@pcobooster/planning-center-models/service-plans";
import type { ServicePlanRow } from "@pcobooster/planning-center-models/service-plans";

export type SearchDomain = "all" | "plans" | "people" | "songs";
export const SEARCH_DELAY_MS = 300;
export const SEARCH_MAX_LENGTH = 80;
const RECENT_LIMIT = 10;

export const normalizedSearch = (text: string): string =>
  text.trim().toLowerCase();

export const matchingPlans = (
  rows: readonly ServicePlanRow[],
  text: string,
  now: Date,
  timeZone: string
): ServicePlanRow[] => {
  const needle = normalizedSearch(text);
  const today = formatCalendarDayInTimeZone(now, timeZone);
  const matches = rows.filter((row) =>
    normalizedSearch(
      [
        row.serviceTypeName,
        row.planTitle,
        row.seriesTitle ?? "",
        formatPlanDate(row.sortDate, timeZone),
      ].join(" ")
    ).includes(needle)
  );
  return matches.toSorted((a, b) => {
    const aUpcoming =
      formatCalendarDayInTimeZone(a.sortDate, timeZone) >= today;
    const bUpcoming =
      formatCalendarDayInTimeZone(b.sortDate, timeZone) >= today;
    if (aUpcoming !== bUpcoming) {
      return aUpcoming ? -1 : 1;
    }
    return (
      (aUpcoming ? 1 : -1) * (a.sortDate.getTime() - b.sortDate.getTime()) ||
      a.serviceTypeId.localeCompare(b.serviceTypeId) ||
      a.planId.localeCompare(b.planId)
    );
  });
};

export const recentSearches = (stored: string | null): string[] => {
  if (stored === null) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (item): item is string =>
          typeof item === "string" &&
          item.trim().length > 0 &&
          item.length <= SEARCH_MAX_LENGTH
      )
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
};

export const addRecentSearch = (
  items: readonly string[],
  text: string
): string[] => {
  const query = text.trim();
  if (query === "" || query.length > SEARCH_MAX_LENGTH) {
    return [...items];
  }
  return [
    query,
    ...items.filter(
      (item) => normalizedSearch(item) !== normalizedSearch(query)
    ),
  ].slice(0, RECENT_LIMIT);
};

export const resultRoute = (
  domain: Exclude<SearchDomain, "all">,
  id: string,
  serviceTypeId?: string
): string => {
  const encoded = encodeURIComponent(id);
  if (domain === "plans") {
    if (serviceTypeId === undefined) {
      throw new Error("A plan result requires its service type");
    }
    return `/services/${encodeURIComponent(serviceTypeId)}/plans/${encoded}`;
  }
  return `/${domain}/${encoded}`;
};
