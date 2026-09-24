import type { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import {
  PlanningCenterAccess,
  withPlanningCenterFaults,
} from "@pcobooster/api/application/planning-center-access";
import { requestPresentationDependencies } from "@pcobooster/api/application/presentation";
import { getPlansForServiceType } from "@pcobooster/api/modules/planning-center/get-plans";
import { getServiceTypes } from "@pcobooster/api/modules/planning-center/get-service-types";
import { getNeededTeamPositionsForPlan } from "@pcobooster/api/modules/planning-center/get-team-positions";
import type { TeamPositionDependencies } from "@pcobooster/api/modules/planning-center/get-team-positions";
import { presentTeamPositions } from "@pcobooster/api/modules/planning-center/presentation";
import type { Server } from "@pcobooster/api/server";
import type {
  Plan,
  ServiceType,
  TeamPositionGroup,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

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
        resolveTimeZone: access.services.organizationTimeZone,
      })
    );
  });

export const getCatalogOrganization: Effect.Effect<
  { readonly timeZone: string },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> = Effect.gen(function* getOrganization() {
  const access = yield* PlanningCenterAccess;
  return {
    timeZone: yield* withPlanningCenterFaults(
      access.services.organizationTimeZone
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
  PlanningCenterAccess | RequestContext | Server
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
    return yield* presentTeamPositions(
      groups,
      yield* requestPresentationDependencies
    );
  }).pipe(withPlanningCenterFaults);
