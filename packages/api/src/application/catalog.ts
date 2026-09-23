import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  PlanningCenterAccess,
  tryPlanningCenter,
} from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterRequestAccess } from "@pcobooster/api/application/planning-center-access";
import { getPlansForServiceType } from "@pcobooster/api/modules/planning-center/get-plans";
import { getServiceTypes } from "@pcobooster/api/modules/planning-center/get-service-types";
import { getNeededTeamPositionsForPlan } from "@pcobooster/api/modules/planning-center/get-team-positions";
import type { TeamPositionDependencies } from "@pcobooster/api/modules/planning-center/get-team-positions";
import { presentTeamPositions } from "@pcobooster/api/modules/planning-center/presentation";
import { resolveOrganizationTimeZone } from "@pcobooster/api/planning-center/resolve-organization-timezone";
import type {
  Plan,
  ServiceType,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { getPresentationSeed } from "@pcobooster/presentation-mode";
import { Effect } from "effect";

const resolveRequestTimeZone = async (
  access: PlanningCenterRequestAccess,
  signal?: AbortSignal
): Promise<string> =>
  await resolveOrganizationTimeZone({
    cacheScope: access.cacheScope,
    catalogService: access.services.catalog,
    signal,
  });

export const getCatalogServiceTypes: Effect.Effect<
  ServiceType[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> = Effect.gen(function* listServiceTypes() {
  const access = yield* PlanningCenterAccess;
  return yield* tryPlanningCenter(
    async (signal) => await getServiceTypes(access.services.catalog, signal)
  );
});

export const getCatalogPlans = (input: {
  readonly serviceTypeId: string;
}): Effect.Effect<
  Plan[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* listPlans() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async (signal) =>
        await getPlansForServiceType(
          input.serviceTypeId,
          {
            plansService: access.services.plans,
            resolveTimeZone: async (timeZoneSignal) =>
              await resolveRequestTimeZone(access, timeZoneSignal),
          },
          signal
        )
    );
  });

export const getCatalogOrganization: Effect.Effect<
  { readonly timeZone: string },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> = Effect.gen(function* getOrganization() {
  const access = yield* PlanningCenterAccess;
  return {
    timeZone: yield* tryPlanningCenter(
      async (signal) => await resolveRequestTimeZone(access, signal)
    ),
  };
});

export const getCatalogTeamPositions = (input: {
  readonly serviceTypeId: string;
  readonly planId: string;
  readonly seriesId?: string;
}): Effect.Effect<
  TeamPositionGroup[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* getTeamPositions() {
    const access = yield* PlanningCenterAccess;
    const dependencies: TeamPositionDependencies = {
      catalogService: access.services.catalog,
      peopleService: access.services.people,
      plansService: access.services.plans,
    };
    const groups = yield* tryPlanningCenter(
      async (signal) =>
        await getNeededTeamPositionsForPlan(
          input.serviceTypeId,
          input.planId,
          input.seriesId,
          dependencies,
          signal
        )
    );

    return yield* tryPlanningCenter(
      async (signal) =>
        await presentTeamPositions(
          groups,
          {
            catalog: access.services.catalog,
            people: access.services.people,
            getPresentationSeed,
            isPresentationMode: () => access.presentation,
          },
          signal
        )
    );
  });
