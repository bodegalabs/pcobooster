import { RequestContext } from "@worship-admin/api/application/context";
import type { ApplicationFault } from "@worship-admin/api/application/errors";
import { NotFound } from "@worship-admin/api/application/errors/not-found";
import {
  PlanningCenterAccess,
  tryPlanningCenter,
} from "@worship-admin/api/application/planning-center-access";
import type { PlanningCenterRequestAccess } from "@worship-admin/api/application/planning-center-access";
import {
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@worship-admin/api/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@worship-admin/api/auth/planning-center-account-identity";
import { peoplePageFlag } from "@worship-admin/api/people-page-flag";
import { resolveOrganizationTimeZone } from "@worship-admin/api/planning-center/resolve-organization-timezone";
import type {
  Blockout,
  PersonWithAvailability,
} from "@worship-admin/api/types";
import { getCurrentUserScheduledPlanIds } from "@worship-admin/api/use-cases/planning-center/get-current-user-scheduled-plans";
import { getPeopleDashboard as getPeopleDashboardData } from "@worship-admin/api/use-cases/planning-center/get-people-dashboard";
import { getPeopleDashboardPerson as getPeopleDashboardPersonDetail } from "@worship-admin/api/use-cases/planning-center/get-people-dashboard-person";
import {
  getPeopleForPosition,
  warmPeopleHistoryForPlan,
} from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import type { PeopleForPositionDependencies } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";
import { getFutureBlockoutsForPerson } from "@worship-admin/api/use-cases/planning-center/get-person-blockouts";
import { getScheduleHistory } from "@worship-admin/api/use-cases/planning-center/get-schedule-history";
import type { ScheduleHistoryResult } from "@worship-admin/api/use-cases/planning-center/get-schedule-history";
import type {
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
  PeopleDashboardRange,
} from "@worship-admin/api/use-cases/planning-center/people-dashboard-types";
import {
  presentBlockouts,
  presentDashboard,
  presentDashboardPerson,
  presentPeople,
  getPresentationIdentityMapper,
} from "@worship-admin/api/use-cases/planning-center/presentation";
import { searchPeople } from "@worship-admin/api/use-cases/planning-center/search-people";
import type { PeopleSearchResult } from "@worship-admin/api/use-cases/planning-center/search-people";
import { Effect } from "effect";

const resolveRequestTimeZone = async (
  access: PlanningCenterRequestAccess
): Promise<string> =>
  await resolveOrganizationTimeZone({
    cacheScope: access.cacheScope,
    catalogService: access.services.catalog,
  });

const requestPresentationDependencies = (
  access: PlanningCenterRequestAccess
) => ({
  catalog: access.services.catalog,
  people: access.services.people,
});

const requestPeopleForPositionDependencies = (
  access: PlanningCenterRequestAccess
): PeopleForPositionDependencies => ({
  catalog: access.services.catalog,
  people: access.services.people,
  plans: access.services.plans,
  resolveTimeZone: async () => await resolveRequestTimeZone(access),
});

const requirePeopleDashboard = Effect.gen(function* requirePeopleDashboard() {
  const { request } = yield* RequestContext;
  const enabled = yield* tryPlanningCenter(
    async () => await peoplePageFlag(request)
  );
  if (!enabled) {
    yield* Effect.fail(
      new NotFound({
        message: "People dashboard is not enabled.",
        resource: "people-dashboard",
      })
    );
  }
});

export const getPeopleList = (input: {
  readonly serviceTypeId: string;
  readonly positionId: string;
  readonly teamId?: string;
  readonly planId?: string;
  readonly date?: string;
}): Effect.Effect<
  PersonWithAvailability[],
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* listPeople() {
    const access = yield* PlanningCenterAccess;
    const people = yield* tryPlanningCenter(
      async () =>
        await getPeopleForPosition(
          input,
          requestPeopleForPositionDependencies(access)
        )
    );
    return yield* tryPlanningCenter(
      async () =>
        await presentPeople(people, requestPresentationDependencies(access))
    );
  });

export const getPeopleSearch = (input: {
  readonly query: string;
}): Effect.Effect<
  PeopleSearchResult[],
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* searchDirectory() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await searchPeople(input.query, 15, {
          people: access.services.people,
          getIdentityMapper: async () =>
            await getPresentationIdentityMapper(
              requestPresentationDependencies(access)
            ),
        })
    );
  });

export const warmPeople = (input: {
  readonly serviceTypeId: string;
  readonly date: string;
}): Effect.Effect<
  { readonly warmed: true },
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* warmPeopleHistory() {
    const access = yield* PlanningCenterAccess;
    yield* tryPlanningCenter(async () => {
      await warmPeopleHistoryForPlan(
        input,
        requestPeopleForPositionDependencies(access)
      );
    });
    return { warmed: true };
  });

export const getPeopleBlockouts = (input: {
  readonly personId: string;
}): Effect.Effect<Blockout[], ApplicationFault, PlanningCenterAccess> =>
  Effect.gen(function* listPeopleBlockouts() {
    const access = yield* PlanningCenterAccess;
    const blockouts = yield* tryPlanningCenter(
      async () =>
        await getFutureBlockoutsForPerson(input.personId, {
          peopleService: access.services.people,
        })
    );
    return presentBlockouts(blockouts);
  });

export const getPeopleDashboard = (input: {
  readonly range: PeopleDashboardRange;
}): Effect.Effect<
  PeopleDashboardData,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* readPeopleDashboard() {
    yield* requirePeopleDashboard;
    const access = yield* PlanningCenterAccess;
    const dashboard = yield* tryPlanningCenter(
      async () =>
        await getPeopleDashboardData({
          range: input.range,
          peopleService: access.services.people,
          resolveTimeZone: async () => await resolveRequestTimeZone(access),
        })
    );
    return yield* tryPlanningCenter(
      async () =>
        await presentDashboard(
          dashboard,
          requestPresentationDependencies(access)
        )
    );
  });

export const getPeopleDashboardPerson = (input: {
  readonly personId: string;
  readonly month?: string;
}): Effect.Effect<
  PeopleDashboardPersonDetail,
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* readPeopleDashboardPerson() {
    yield* requirePeopleDashboard;
    const access = yield* PlanningCenterAccess;
    const detail = yield* tryPlanningCenter(
      async () =>
        await getPeopleDashboardPersonDetail({
          personId: input.personId,
          month: input.month,
          dependencies: {
            peopleService: access.services.people,
            catalogService: access.services.catalog,
            plansService: access.services.plans,
            resolveTimeZone: async () => await resolveRequestTimeZone(access),
          },
        })
    );
    return yield* tryPlanningCenter(
      async () =>
        await presentDashboardPerson(
          detail,
          requestPresentationDependencies(access)
        )
    );
  });

export const getPeopleScheduleHistory = (input: {
  readonly personId: string;
  readonly days: number;
}): Effect.Effect<
  ScheduleHistoryResult,
  ApplicationFault,
  PlanningCenterAccess
> =>
  Effect.gen(function* readPeopleScheduleHistory() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async () =>
        await getScheduleHistory(input.personId, input.days, {
          peopleService: access.services.people,
          resolveTimeZone: async () => await resolveRequestTimeZone(access),
        })
    );
  });

export const getMyScheduledPlans = (input: {
  readonly planIds: readonly string[];
}): Effect.Effect<
  { readonly planIds: string[] },
  ApplicationFault,
  PlanningCenterAccess | RequestContext
> =>
  Effect.gen(function* readMyScheduledPlans() {
    const access = yield* PlanningCenterAccess;
    const { request } = yield* RequestContext;
    const uniquePlanIds = [...new Set(input.planIds)];
    const planIds = yield* tryPlanningCenter(
      async () =>
        await getCurrentUserScheduledPlanIds(
          request,
          access.authentication.account,
          uniquePlanIds,
          {
            peopleService: access.services.people,
            isDevAuthBypassEnabled,
            loadDevBypassIdentity,
            getPlanningCenterIdentityForAccount,
          }
        )
    );
    return { planIds };
  });
