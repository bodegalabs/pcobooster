import type { ApplicationFault } from "@worship-admin/api/application/errors";
import {
  PlanningCenterAccess,
  tryPlanningCenter,
} from "@worship-admin/api/application/planning-center-access";
import type { PlanningCenterRequestAccess } from "@worship-admin/api/application/planning-center-access";
import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";
import type {
  Plan,
  ServiceType,
  TeamPositionGroup,
} from "@worship-admin/api/types";
import { getPlansForServiceType } from "@worship-admin/api/use-cases/planning-center/get-plans";
import { getServiceTypes } from "@worship-admin/api/use-cases/planning-center/get-service-types";
import { getNeededTeamPositionsForPlan } from "@worship-admin/api/use-cases/planning-center/get-team-positions";
import type { TeamPositionDependencies } from "@worship-admin/api/use-cases/planning-center/get-team-positions";
import { presentTeamPositions } from "@worship-admin/api/use-cases/planning-center/presentation";
import { Effect } from "effect";

const resolveRequestTimeZone = async (
  access: PlanningCenterRequestAccess
): Promise<string> =>
  await resolveOrganizationTimeZone({
    cacheScope: access.cacheScope,
    catalogService: access.services.catalog,
  });

export const getCatalogServiceTypes: Effect.Effect<
  ServiceType[],
  ApplicationFault,
  PlanningCenterAccess
> = Effect.gen(function* listServiceTypes() {
  const access = yield* PlanningCenterAccess;
  return yield* tryPlanningCenter(
    async () => await getServiceTypes(access.services.catalog)
  );
});

export const getCatalogPlans = (input: {
  readonly serviceTypeId: string;
}): Effect.Effect<Plan[], ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* listPlans() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await getPlansForServiceType(input.serviceTypeId, {
          plansService: access.services.plans,
          resolveTimeZone: async () => await resolveRequestTimeZone(access),
        })
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
      async () => await resolveRequestTimeZone(access)
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
      async () =>
        await getNeededTeamPositionsForPlan(
          input.serviceTypeId,
          input.planId,
          input.seriesId,
          dependencies
        )
    );

    return yield* tryPlanningCenter(
      async () =>
        await presentTeamPositions(groups, {
          catalog: access.services.catalog,
          people: access.services.people,
        })
    );
  });
