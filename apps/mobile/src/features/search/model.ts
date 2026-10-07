import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { formatPlanDate } from "@pcobooster/planning-center-models/service-plans";
import type { ServicePlanRow } from "@pcobooster/planning-center-models/service-plans";

import type { SearchRecent } from "../../app-shell/local-query-data";

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

export type { SearchRecent } from "../../app-shell/local-query-data";

export const recentIdentity = (item: SearchRecent): string =>
  item.kind === "query"
    ? `query:${normalizedSearch(item.text)}`
    : `${item.kind}:${item.kind === "plans" ? `${item.serviceTypeId}:` : ""}${item.id}`;
export const addRecentItem = (
  items: readonly SearchRecent[],
  item: SearchRecent
): SearchRecent[] =>
  [
    item,
    ...items.filter(
      (existing) => recentIdentity(existing) !== recentIdentity(item)
    ),
  ].slice(0, RECENT_LIMIT);
export const recentDestination = (item: SearchRecent): string | null =>
  item.kind === "query"
    ? null
    : resultRoute(
        item.kind,
        item.id,
        item.kind === "plans" ? item.serviceTypeId : undefined
      );
export const visibleRecents = (
  items: readonly SearchRecent[],
  domains: readonly SearchDomain[]
): SearchRecent[] => {
  const allowed = new Set(domains);
  return items.filter(
    (item) => item.kind === "query" || allowed.has(item.kind)
  );
};
