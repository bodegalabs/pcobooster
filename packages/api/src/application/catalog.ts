import type { ApplicationFault } from "@pcobooster/api/application/errors";
import type { PlanningCenterAccess } from "@pcobooster/api/application/planning-center-access";
import { withPlanningCenterFaults } from "@pcobooster/api/application/planning-center-access";
import { PlanningCenterCatalog } from "@pcobooster/api/application/planning-center/catalog";
import { OrganizationTimeZone } from "@pcobooster/api/application/planning-center/organization-time-zone";
import { PlanningCenterPeople } from "@pcobooster/api/application/planning-center/people";
import { PlanningCenterPlans } from "@pcobooster/api/application/planning-center/plans";
import { requestPresentationDependencies } from "@pcobooster/api/application/presentation";
import {
  getAdjacentPlans,
  getPlanDetails,
} from "@pcobooster/api/modules/planning-center/get-adjacent-plans";
import type { PlanDirection } from "@pcobooster/api/modules/planning-center/get-adjacent-plans";
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
  PlanningCenterCatalog
> = Effect.gen(function* listServiceTypes() {
  const catalogService = yield* PlanningCenterCatalog;
  return yield* withPlanningCenterFaults(getServiceTypes(catalogService));
});

export const getCatalogPlans = (input: {
  readonly serviceTypeId: string;
}): Effect.Effect<
  Plan[],
  ApplicationFault,
  OrganizationTimeZone | PlanningCenterPlans
> =>
  Effect.gen(function* listPlans() {
    const plansService = yield* PlanningCenterPlans;
    const organizationTimeZone = yield* OrganizationTimeZone;
    return yield* withPlanningCenterFaults(
      getPlansForServiceType(input.serviceTypeId, {
        plansService,
        resolveTimeZone: organizationTimeZone,
      })
    );
  });

export const getCatalogPlan = (input: {
  readonly serviceTypeId: string;
  readonly planId: string;
}): Effect.Effect<Plan | null, ApplicationFault, PlanningCenterPlans> =>
  Effect.gen(function* getPlan() {
    const plansService = yield* PlanningCenterPlans;
    return yield* withPlanningCenterFaults(
      getPlanDetails(input.serviceTypeId, input.planId, {
        plansService,
      })
    );
  });

export const getCatalogAdjacentPlans = (input: {
  readonly serviceTypeId: string;
  readonly planId: string;
  readonly direction: PlanDirection;
}): Effect.Effect<
  Plan[],
  ApplicationFault,
  OrganizationTimeZone | PlanningCenterPlans
> =>
  Effect.gen(function* findAdjacentPlans() {
    const plansService = yield* PlanningCenterPlans;
    const organizationTimeZone = yield* OrganizationTimeZone;
    return yield* withPlanningCenterFaults(
      getAdjacentPlans(input.serviceTypeId, input.planId, input.direction, {
        plansService,
        resolveTimeZone: organizationTimeZone,
      })
    );
  });

export const getCatalogOrganization: Effect.Effect<
  { readonly timeZone: string },
  ApplicationFault,
  OrganizationTimeZone
> = Effect.gen(function* getOrganization() {
  const organizationTimeZone = yield* OrganizationTimeZone;
  return {
    timeZone: yield* withPlanningCenterFaults(organizationTimeZone),
  };
});

export const getCatalogTeamPositions = (input: {
  readonly serviceTypeId: string;
  readonly planId: string;
  readonly seriesId?: string;
}): Effect.Effect<
  TeamPositionGroup[],
  ApplicationFault,
  | PlanningCenterAccess
  | PlanningCenterCatalog
  | PlanningCenterPeople
  | PlanningCenterPlans
  | Server
> =>
  Effect.gen(function* getTeamPositions() {
    const peopleService = yield* PlanningCenterPeople;
    const catalogService = yield* PlanningCenterCatalog;
    const plansService = yield* PlanningCenterPlans;
    const dependencies: TeamPositionDependencies = {
      catalogService,
      peopleService,
      plansService,
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
