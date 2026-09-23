export type PlanView = "assign" | "lineup" | "plan" | "times";

export const planViews: readonly PlanView[] = [
  "assign",
  "lineup",
  "plan",
  "times",
];

const planViewLabels: Record<PlanView, string> = {
  assign: "Assign",
  lineup: "Lineup",
  plan: "Plan",
  times: "Times",
};

export const getPlanViewLabel = (view: PlanView): string =>
  planViewLabels[view];

export const isPlanView = (value: string): value is PlanView =>
  planViews.some((view) => view === value);

export interface PlanRoute {
  serviceTypeId: string;
  planId: string;
  view: PlanView;
}

const planRoutePattern =
  /^\/services\/(?<serviceTypeId>[^/]+)\/plans\/(?<planId>[^/]+)\/(?<view>[^/]+)$/u;

export const parsePlanRoute = (pathname: string): PlanRoute | null => {
  const match = planRoutePattern.exec(pathname);
  if (!match) {
    return null;
  }
  const [, serviceTypeId, planId, view] = match;
  if (!isPlanView(view)) {
    return null;
  }
  return { serviceTypeId, planId, view };
};

/** Switches the plan workspace view while keeping the selected slot query. */
export const buildPlanViewUrl = (
  pathname: string,
  searchParams: Pick<URLSearchParams, "toString">,
  view: PlanView
): string => {
  const route = parsePlanRoute(pathname);
  if (!route) {
    return "/services";
  }
  const query = searchParams.toString();
  const path = `/services/${route.serviceTypeId}/plans/${route.planId}/${view}`;
  return query ? `${path}?${query}` : path;
};

export type AppSection = "services" | "people";

export const getAppSection = (pathname: string): AppSection => {
  if (pathname.startsWith("/people")) {
    return "people";
  }
  return "services";
};

const appSectionLabels: Record<AppSection, string> = {
  services: "Services",
  people: "People",
};

export const getAppSectionLabel = (section: AppSection): string =>
  appSectionLabels[section];

export interface DetailRoute {
  parentHref: string;
  parentLabel: string;
  label: string;
}

/** Detail pages that sit one level under a top-level section. */
export const parseDetailRoute = (pathname: string): DetailRoute | null => {
  if (/^\/people\/[^/]+/u.test(pathname)) {
    return { parentHref: "/people", parentLabel: "People", label: "Person" };
  }
  return null;
};
