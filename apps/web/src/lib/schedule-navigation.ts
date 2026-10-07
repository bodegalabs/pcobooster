import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { PlanView } from "@pcobooster/planning-center-models/plan-overview";
import { linkOptions } from "@tanstack/react-router";

export type DashboardView = PlanView;

/** A plan workspace view and its selected team position slot. */
export interface PlanSlotSelection {
  serviceTypeId: string;
  planId: string;
  view: DashboardView;
  teamId: string | null;
  positionId: string | null;
}

/** Opens a plan on its Overview. */
export const planWorkspaceLink = (serviceTypeId: string, planId: string) =>
  linkOptions({
    to: "/services/$serviceTypeId/plans/$planId/$view",
    params: { serviceTypeId, planId, view: "overview" },
  });

/**
 * Selects a view and slot in a plan. Within the plan on screen this is a client-side
 * navigation that keeps the workspace mounted and renders from the query cache.
 */
export const planSlotLink = ({
  serviceTypeId,
  planId,
  view,
  teamId,
  positionId,
}: PlanSlotSelection) =>
  linkOptions({
    to: "/services/$serviceTypeId/plans/$planId/$view",
    params: { serviceTypeId, planId, view },
    // An unselected slot stays out of the URL.
    search: {
      teamId: isNonEmptyString(teamId) ? teamId : undefined,
      positionId: isNonEmptyString(positionId) ? positionId : undefined,
    },
  });
