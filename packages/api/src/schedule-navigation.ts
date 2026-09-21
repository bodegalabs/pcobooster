import { isNonEmptyString } from "@worship-admin/api/json";

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
