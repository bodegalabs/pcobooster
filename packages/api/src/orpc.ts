import { implement } from "@orpc/server";
import {
  getCatalogOrganization,
  getCatalogPlans,
  getCatalogServiceTypes,
  getCatalogTeamPositions,
} from "@worship-admin/api/application/catalog";
import { RequestContext } from "@worship-admin/api/application/context";
import { withPlanningCenterAccess } from "@worship-admin/api/application/planning-center-access";
import { createApplicationRuntime } from "@worship-admin/api/application/runtime";
import type { RpcContext } from "@worship-admin/api/transport/orpc/context";
import { executeApplicationEffect } from "@worship-admin/api/transport/orpc/execute";
import { appContract } from "@worship-admin/contracts";
import { Effect, Layer } from "effect";

const applicationRuntime = createApplicationRuntime(Layer.empty);
const rpc = implement(appContract).$context<RpcContext>();

const health = rpc.health.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      Effect.as(RequestContext, { status: "ok" as const }),
      context,
      signal
    )
);

const catalogServiceTypes = rpc.catalog.serviceTypes.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogServiceTypes),
      context,
      signal
    )
);

const catalogPlans = rpc.catalog.plans.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogPlans(input)),
      context,
      signal
    )
);

const catalogOrganization = rpc.catalog.organization.handler(
  async ({ context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogOrganization),
      context,
      signal
    )
);

const catalogTeamPositions = rpc.catalog.teamPositions.handler(
  async ({ input, context, signal }) =>
    await executeApplicationEffect(
      applicationRuntime,
      withPlanningCenterAccess(getCatalogTeamPositions(input)),
      context,
      signal
    )
);

export const appRouter = rpc.router({
  catalog: {
    serviceTypes: catalogServiceTypes,
    plans: catalogPlans,
    organization: catalogOrganization,
    teamPositions: catalogTeamPositions,
  },
  health,
});

export type AppRouter = typeof appRouter;

export const disposeApplicationRuntime = async (): Promise<void> => {
  await applicationRuntime.dispose();
};
