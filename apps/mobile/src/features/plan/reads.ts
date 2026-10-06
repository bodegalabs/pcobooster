import { callForQuery } from "@pcobooster/client/query";
import { queryOptions } from "@tanstack/react-query";

import type { ProductClientContextValue } from "../../app-shell/queries";

/** Reads need the client and its account scope, not the scheduler. */
export type PlanReadContext = Pick<
  ProductClientContextValue,
  "client" | "scope"
>;

export interface PlanIds {
  readonly serviceTypeId: string;
  readonly planId: string;
  readonly seriesId?: string;
}
export type PlanSegment = "Overview" | "Lineup" | "Plan" | "Times";
export const segments: readonly PlanSegment[] = [
  "Overview",
  "Lineup",
  "Plan",
  "Times",
];
export const routeSegment = (value?: string): PlanSegment =>
  segments.find((segment) => segment.toLowerCase() === value) ?? "Overview";
export const planHref = (
  { serviceTypeId, planId }: PlanIds,
  segment: PlanSegment
): string =>
  `/services/${serviceTypeId}/plans/${planId}${segment === "Overview" ? "" : `/${segment.toLowerCase()}`}`;

export const assignHref = (
  ids: PlanIds,
  teamId?: string,
  positionId?: string
): string => {
  const query = new URLSearchParams();
  if (teamId !== undefined) {
    query.set("teamId", teamId);
  }
  if (positionId !== undefined) {
    query.set("positionId", positionId);
  }
  const encoded = query.toString();
  const suffix = encoded === "" ? "" : `?${encoded}`;
  return `${planHref(ids, "Overview")}/assign${suffix}`;
};

export const planReads = {
  access: ({ client, scope }: PlanReadContext) =>
    queryOptions({
      queryKey: [scope, "access.me"],
      queryFn: async (context) =>
        await callForQuery(context, client, (api) => api.access.me()),
    }),
  plan: ({ client, scope }: PlanReadContext, ids: PlanIds) =>
    queryOptions({
      queryKey: [scope, "catalog.plan", ids.serviceTypeId, ids.planId],
      queryFn: async (context) => {
        const input = ids;
        return await callForQuery(context, client, (api) =>
          api.catalog.plan({ params: input })
        );
      },
      staleTime: 60_000,
    }),
  groups: ({ client, scope }: PlanReadContext, ids: PlanIds) =>
    queryOptions({
      queryKey: [
        scope,
        "catalog.teamPositions",
        ids.serviceTypeId,
        ids.planId,
        ids.seriesId,
      ],
      queryFn: async (context) => {
        const input = ids;
        return await callForQuery(context, client, (api) =>
          api.catalog.teamPositions({ params: input, query: input })
        );
      },
      staleTime: 60_000,
    }),
  items: ({ client, scope }: PlanReadContext, ids: PlanIds) =>
    queryOptions({
      queryKey: [scope, "planItems.list", ids.serviceTypeId, ids.planId],
      queryFn: async (context) => {
        const input = ids;
        return await callForQuery(context, client, (api) =>
          api.planItems.list({ params: input })
        );
      },
      staleTime: 60_000,
    }),
  times: ({ client, scope }: PlanReadContext, ids: PlanIds) =>
    queryOptions({
      queryKey: [scope, "planTimes.list", ids.serviceTypeId, ids.planId],
      queryFn: async (context) => {
        const input = ids;
        return await callForQuery(context, client, (api) =>
          api.planTimes.list({ params: input })
        );
      },
      staleTime: 60_000,
    }),
  serviceTypes: ({ client, scope }: PlanReadContext) =>
    queryOptions({
      queryKey: [scope, "catalog.serviceTypes"],
      queryFn: async (context) =>
        await callForQuery(context, client, (api) =>
          api.catalog.serviceTypes()
        ),
      staleTime: 600_000,
    }),
  plans: ({ client, scope }: PlanReadContext, serviceTypeId: string) =>
    queryOptions({
      queryKey: [scope, "catalog.plans", serviceTypeId],
      queryFn: async (context) => {
        const input = { serviceTypeId };
        return await callForQuery(context, client, (api) =>
          api.catalog.plans({ params: input })
        );
      },
      staleTime: 60_000,
    }),
};
