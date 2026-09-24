import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
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
import { Effect } from "effect";

const resolveRequestTimeZone = (
  access: PlanningCenterRequestAccess
): Effect.Effect<string> =>
  resolveOrganizationTimeZone({
    cacheScope: access.cacheScope,
    catalogService: access.services.catalog,
    fallbackTimeZone: access.fallbackTimeZone,
  });

export const getCatalogServiceTypes: Effect.Effect<
  ServiceType[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> = Effect.gen(function* listServiceTypes() {
  const access = yield* PlanningCenterAccess;
  return yield* withPlanningCenterFaults(
    getServiceTypes(access.services.catalog)
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
    return yield* withPlanningCenterFaults(
      getPlansForServiceType(input.serviceTypeId, {
        plansService: access.services.plans,
        resolveTimeZone: resolveRequestTimeZone(access),
      })
    );
  });

export const getCatalogOrganization: Effect.Effect<
  { readonly timeZone: string },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> = Effect.gen(function* getOrganization() {
  const access = yield* PlanningCenterAccess;
  return { timeZone: yield* resolveRequestTimeZone(access) };
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
    const groups = yield* getNeededTeamPositionsForPlan(
      input.serviceTypeId,
      input.planId,
      input.seriesId,
      dependencies
    );
    return yield* presentTeamPositions(groups, {
      catalog: access.services.catalog,
      people: access.services.people,
      getPresentationSeed: () => access.presentationSeed,
      isPresentationMode: () => access.presentation,
    });
  }).pipe(withPlanningCenterFaults);
