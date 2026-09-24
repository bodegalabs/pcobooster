import { RequestContext } from "@pcobooster/api/application/context";
import type { ApplicationFault } from "@pcobooster/api/application/errors";
import { NotFound } from "@pcobooster/api/application/errors/not-found";
import { featureFlagSubjectFor } from "@pcobooster/api/application/feature-flags";
import {
  PlanningCenterAccess,
  tryPlanningCenter,
} from "@pcobooster/api/application/planning-center-access";
import type { PlanningCenterRequestAccess } from "@pcobooster/api/application/planning-center-access";
import { loadDevBypassIdentity } from "@pcobooster/api/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@pcobooster/api/auth/planning-center-account-identity";
import { getCurrentUserScheduledPlanIds } from "@pcobooster/api/modules/planning-center/get-current-user-scheduled-plans";
import { getPeopleDashboard as getPeopleDashboardData } from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import { getPeopleDashboardPerson as getPeopleDashboardPersonDetail } from "@pcobooster/api/modules/planning-center/get-people-dashboard-person";
import {
  getPeopleForPosition,
  warmPeopleHistoryForPlan,
} from "@pcobooster/api/modules/planning-center/get-people-for-position";
import type { PeopleForPositionDependencies } from "@pcobooster/api/modules/planning-center/get-people-for-position";
import { getFutureBlockoutsForPerson } from "@pcobooster/api/modules/planning-center/get-person-blockouts";
import { getScheduleHistory } from "@pcobooster/api/modules/planning-center/get-schedule-history";
import type { ScheduleHistoryResult } from "@pcobooster/api/modules/planning-center/get-schedule-history";
import type {
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
  PeopleDashboardRange,
} from "@pcobooster/api/modules/planning-center/people-dashboard-types";
import {
  presentBlockouts,
  presentDashboard,
  presentDashboardPerson,
  presentPeople,
  getPresentationIdentityMapper,
} from "@pcobooster/api/modules/planning-center/presentation";
import { searchPeople } from "@pcobooster/api/modules/planning-center/search-people";
import type { PeopleSearchResult } from "@pcobooster/api/modules/planning-center/search-people";
import { resolveOrganizationTimeZone } from "@pcobooster/api/planning-center/resolve-organization-timezone";
import { Server } from "@pcobooster/api/server";
import type {
  Blockout,
  PersonWithAvailability,
} from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const resolveRequestTimeZone = async (
  access: PlanningCenterRequestAccess,
  signal?: AbortSignal
): Promise<string> =>
  await resolveOrganizationTimeZone({
    cacheScope: access.cacheScope,
    catalogService: access.services.catalog,
    fallbackTimeZone: access.fallbackTimeZone,
    signal,
  });

const requestPresentationDependencies = (
  access: PlanningCenterRequestAccess
) => ({
  catalog: access.services.catalog,
  people: access.services.people,
  isPresentationMode: () => access.presentation,
  getPresentationSeed: () => access.presentationSeed,
});

const requestPeopleForPositionDependencies = (
  access: PlanningCenterRequestAccess,
  signal?: AbortSignal
): PeopleForPositionDependencies => ({
  catalog: access.services.catalog,
  people: access.services.people,
  plans: access.services.plans,
  resolveTimeZone: async (timeZoneSignal) =>
    await resolveRequestTimeZone(access, timeZoneSignal),
  signal,
});

/** The People dashboard exists only where the `people` flag is on for this caller. */
const requirePeopleDashboard = (access: PlanningCenterRequestAccess) =>
  Effect.gen(function* checkPeopleFlag() {
    const { featureFlags } = yield* Server;
    const enabled = yield* featureFlags.isEnabled(
      "people",
      featureFlagSubjectFor(access.authentication)
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
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* listPeople() {
    const access = yield* PlanningCenterAccess;
    const people = yield* tryPlanningCenter(
      async (signal) =>
        await getPeopleForPosition(
          input,
          requestPeopleForPositionDependencies(access, signal)
        )
    );
    return yield* tryPlanningCenter(
      async (signal) =>
        await presentPeople(
          people,
          requestPresentationDependencies(access),
          signal
        )
    );
  });

export const getPeopleSearch = (input: {
  readonly query: string;
}): Effect.Effect<
  PeopleSearchResult[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* searchDirectory() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async (signal) =>
        await searchPeople(
          input.query,
          15,
          {
            people: access.services.people,
            getIdentityMapper: async (mapperSignal) =>
              await getPresentationIdentityMapper(
                requestPresentationDependencies(access),
                mapperSignal
              ),
          },
          signal
        )
    );
  });

export const warmPeople = (input: {
  readonly serviceTypeId: string;
  readonly date: string;
}): Effect.Effect<
  { readonly warmed: true },
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* warmPeopleHistory() {
    const access = yield* PlanningCenterAccess;
    yield* tryPlanningCenter(async (signal) => {
      await warmPeopleHistoryForPlan(
        input,
        requestPeopleForPositionDependencies(access, signal)
      );
    });
    return { warmed: true };
  });

export const getPeopleBlockouts = (input: {
  readonly personId: string;
}): Effect.Effect<
  Blockout[],
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* listPeopleBlockouts() {
    const access = yield* PlanningCenterAccess;
    const blockouts = yield* tryPlanningCenter(
      async (signal) =>
        await getFutureBlockoutsForPerson(
          input.personId,
          {
            peopleService: access.services.people,
          },
          signal
        )
    );
    return presentBlockouts(blockouts, access.presentation);
  });

export const getPeopleDashboard = (input: {
  readonly range: PeopleDashboardRange;
}): Effect.Effect<
  PeopleDashboardData,
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* readPeopleDashboard() {
    const access = yield* PlanningCenterAccess;
    yield* requirePeopleDashboard(access);
    const dashboard = yield* tryPlanningCenter(
      async (signal) =>
        await getPeopleDashboardData(
          {
            range: input.range,
            peopleService: access.services.people,
            resolveTimeZone: async (timeZoneSignal) =>
              await resolveRequestTimeZone(access, timeZoneSignal),
          },
          signal
        )
    );
    return yield* tryPlanningCenter(
      async (signal) =>
        await presentDashboard(
          dashboard,
          requestPresentationDependencies(access),
          signal
        )
    );
  });

export const getPeopleDashboardPerson = (input: {
  readonly personId: string;
  readonly month?: string;
}): Effect.Effect<
  PeopleDashboardPersonDetail,
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* readPeopleDashboardPerson() {
    const access = yield* PlanningCenterAccess;
    yield* requirePeopleDashboard(access);
    const detail = yield* tryPlanningCenter(
      async (signal) =>
        await getPeopleDashboardPersonDetail(
          {
            personId: input.personId,
            month: input.month,
            dependencies: {
              peopleService: access.services.people,
              catalogService: access.services.catalog,
              plansService: access.services.plans,
              resolveTimeZone: async (timeZoneSignal) =>
                await resolveRequestTimeZone(access, timeZoneSignal),
            },
          },
          signal
        )
    );
    return yield* tryPlanningCenter(
      async (signal) =>
        await presentDashboardPerson(
          detail,
          requestPresentationDependencies(access),
          signal
        )
    );
  });

export const getPeopleScheduleHistory = (input: {
  readonly personId: string;
  readonly days: number;
}): Effect.Effect<
  ScheduleHistoryResult,
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* readPeopleScheduleHistory() {
    const access = yield* PlanningCenterAccess;
    return yield* tryPlanningCenter(
      async (signal) =>
        await getScheduleHistory(
          input.personId,
          input.days,
          {
            peopleService: access.services.people,
            resolveTimeZone: async (timeZoneSignal) =>
              await resolveRequestTimeZone(access, timeZoneSignal),
          },
          signal
        )
    );
  });

export const getMyScheduledPlans = (input: {
  readonly planIds: readonly string[];
}): Effect.Effect<
  { readonly planIds: string[] },
  ApplicationFault,
  PlanningCenterAccess | RequestContext | Server
> =>
  Effect.gen(function* readMyScheduledPlans() {
    const access = yield* PlanningCenterAccess;
    const { request } = yield* RequestContext;
    const { auth, config } = yield* Server;
    // A demo visitor is not a person in the demo organization.
    if (access.authentication.kind === "demo") {
      return { planIds: [] };
    }
    const { account } = access.authentication;
    const uniquePlanIds = [...new Set(input.planIds)];
    const planIds = yield* tryPlanningCenter(
      async (signal) =>
        await getCurrentUserScheduledPlanIds(
          request,
          account,
          uniquePlanIds,
          {
            peopleService: access.services.people,
            isDevAuthBypassEnabled: () => config.devAuthBypass,
            loadDevBypassIdentity: async () =>
              await loadDevBypassIdentity(config.localPlanningCenterToken),
            getPlanningCenterIdentityForAccount: async (
              identityRequest,
              identityAccount
            ) =>
              await getPlanningCenterIdentityForAccount(
                auth,
                identityRequest,
                identityAccount
              ),
          },
          signal
        )
    );
    return { planIds };
  });
