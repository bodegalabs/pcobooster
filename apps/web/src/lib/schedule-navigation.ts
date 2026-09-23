import { isNonEmptyString } from "@pcobooster/planning-center-models/json";

import { parsePlanRoute } from "@/lib/app-routes";

interface RouteSelectionIds {
  teamId: string | null;
  positionId: string | null;
  view: DashboardView;
}

export type NavigationSelectionIds = RouteSelectionIds & {
  serviceTypeId: string | null;
  planId: string | null;
};

export type DashboardView = "assign" | "lineup" | "plan" | "times";
type SearchParamReader = Pick<URLSearchParams, "get">;

export const buildPlanMemberPositionId = (
  teamId: string,
  positionName: string
): string =>
  `plan-member-position:${teamId}:${encodeURIComponent(positionName.trim().toLowerCase())}`;

export const parseSearchSelection = (
  searchParams: SearchParamReader,
  view: DashboardView
): RouteSelectionIds => {
  const teamId = searchParams.get("teamId");
  const positionId = searchParams.get("positionId");

  return {
    teamId: teamId ?? null,
    positionId: positionId ?? null,
    view,
  };
};

export const buildScheduleUrl = ({
  serviceTypeId,
  planId,
  teamId,
  positionId,
  view,
}: NavigationSelectionIds): string => {
  if (!isNonEmptyString(serviceTypeId) || !isNonEmptyString(planId)) {
    return "/services";
  }

  const searchParams = new URLSearchParams();
  if (isNonEmptyString(teamId)) {
    searchParams.set("teamId", teamId);
  }
  if (isNonEmptyString(positionId)) {
    searchParams.set("positionId", positionId);
  }

  const query = searchParams.toString();
  const path = `/services/${encodeURIComponent(serviceTypeId)}/plans/${encodeURIComponent(planId)}/${view}`;
  return query ? `${path}?${query}` : path;
};

export const buildPlanWorkspaceUrl = (
  serviceTypeId: string,
  planId: string
): string =>
  buildScheduleUrl({
    serviceTypeId,
    planId,
    view: "assign",
    teamId: null,
    positionId: null,
  });

/**
 * Moves between views and slots of the plan already on screen without a server
 * round trip. Every view renders from the client query cache, and History API
 * updates keep usePathname and useSearchParams in sync. Returns false when the
 * destination is another page, which the Next.js router must render.
 */
export const updatePlanWorkspaceUrl = (
  currentPathname: string,
  nextUrl: string,
  method: "push" | "replace"
): boolean => {
  const current = parsePlanRoute(currentPathname);
  const next = parsePlanRoute(nextUrl.split("?")[0] ?? "");
  if (
    !current ||
    !next ||
    current.serviceTypeId !== next.serviceTypeId ||
    current.planId !== next.planId
  ) {
    return false;
  }
  if (method === "replace") {
    window.history.replaceState(null, "", nextUrl);
  } else {
    window.history.pushState(null, "", nextUrl);
  }
  return true;
};
