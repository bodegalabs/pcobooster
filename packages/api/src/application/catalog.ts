import type { ApplicationFault } from "@worship-admin/api/application/errors";
import {
  PlanningCenterAccess,
  tryPlanningCenter,
} from "@worship-admin/api/application/planning-center-access";
import type { PlanningCenterRequestAccess } from "@worship-admin/api/application/planning-center-access";
import { getPlansForServiceType } from "@worship-admin/api/modules/planning-center/get-plans";
import { getServiceTypes } from "@worship-admin/api/modules/planning-center/get-service-types";
import { getNeededTeamPositionsForPlan } from "@worship-admin/api/modules/planning-center/get-team-positions";
import type { TeamPositionDependencies } from "@worship-admin/api/modules/planning-center/get-team-positions";
import { presentTeamPositions } from "@worship-admin/api/modules/planning-center/presentation";
import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";
import type {
  Plan,
  ServiceType,
  TeamPositionGroup,
} from "@worship-admin/planning-center-models/types";
import {
  getPresentationSeed,
  isPresentationMode,
} from "@worship-admin/presentation-mode";
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
  PlanningCenterAccess
> = Effect.gen(function* listServiceTypes() {
  const access = yield* PlanningCenterAccess;
  return yield* tryPlanningCenter(
    async (signal) => await getServiceTypes(access.services.catalog, signal)
  );
});

export const getCatalogPlans = (input: {
  readonly serviceTypeId: string;
}): Effect.Effect<Plan[], ApplicationFault, PlanningCenterAccess> =>
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
  PlanningCenterAccess
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
  PlanningCenterAccess
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
            isPresentationMode,
          },
          signal
        )
    );
  });
