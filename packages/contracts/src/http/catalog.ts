/** Service types, plans, and the organization, read from Planning Center. */
import { read } from "@pcobooster/contracts/http/endpoint";
import { planningCenterGroup } from "@pcobooster/contracts/http/group";
import {
  adjacentPlansInputSchema,
  planInputSchema,
  plansInputSchema,
  planSchema,
  serviceTypeSchema,
  teamPositionGroupSchema,
  teamPositionsInputSchema,
} from "@pcobooster/contracts/rpc/catalog";
import { mutableArray } from "@pcobooster/contracts/rpc/schema";
import { Schema, Struct } from "effect";

const PLAN = ["serviceTypeId", "planId"] as const;

export const catalog = planningCenterGroup(
  "catalog",
  read("catalog.serviceTypes", "/service-types", {
    params: {},
    query: {},
    success: mutableArray(serviceTypeSchema),
  }),
  read("catalog.organization", "/organization", {
    params: {},
    query: {},
    success: Schema.Struct({ timeZone: Schema.String }),
  }),
  read("catalog.plans", "/service-types/:serviceTypeId/plans", {
    params: plansInputSchema.fields,
    query: {},
    success: mutableArray(planSchema),
  }),
  /** Null when the plan doesn't exist. */
  read("catalog.plan", "/service-types/:serviceTypeId/plans/:planId", {
    params: planInputSchema.fields,
    query: {},
    success: Schema.NullOr(planSchema),
  }),
  /** Nearest first; empty when the plan doesn't exist or nothing is on that side. */
  read(
    "catalog.adjacentPlans",
    "/service-types/:serviceTypeId/plans/:planId/adjacent",
    {
      params: Struct.pick(adjacentPlansInputSchema.fields, PLAN),
      query: Struct.omit(adjacentPlansInputSchema.fields, PLAN),
      success: mutableArray(planSchema),
    }
  ),
  read(
    "catalog.teamPositions",
    "/service-types/:serviceTypeId/plans/:planId/team-positions",
    {
      params: Struct.pick(teamPositionsInputSchema.fields, PLAN),
      query: Struct.omit(teamPositionsInputSchema.fields, PLAN),
      success: mutableArray(teamPositionGroupSchema),
    }
  )
);
