import type { DevBypassIdentity } from "@pcobooster/api/auth/dev-bypass";
import type { PlanningCenterIdentity } from "@pcobooster/api/auth/planning-center-identity";
import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar";
import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

const PERSON_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

const extractPersonIdFromIdentitySub = (sub: string | null): string | null => {
  if (!isNonEmptyString(sub)) {
    return null;
  }
  const trimmed = sub.trim();
  if (!trimmed) {
    return null;
  }

  if (PERSON_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const urlParts = parsed.pathname.split("/").filter(Boolean);
    return urlParts.at(-1) ?? null;
  } catch {
    const parts = trimmed.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  }
};

const getRelatedPlanId = (schedule: PCResource): string | null => {
  const planRel = schedule.relationships?.plan?.data;
  if (!planRel || Array.isArray(planRel)) {
    return null;
  }
  return planRel.id;
};

export interface CurrentUserIdentityDependencies {
  readonly isDevAuthBypassEnabled: () => boolean;
  readonly loadDevBypassIdentity: () => Promise<DevBypassIdentity>;
  readonly getPlanningCenterIdentityForAccount: (
    request: Request,
    account: { id: string; accountId: string }
  ) => Promise<PlanningCenterIdentity | null>;
}

export interface CurrentUserScheduledPlansDependencies extends CurrentUserIdentityDependencies {
  readonly peopleService: Pick<
    PlanningCenterPeopleService,
    "getPersonSchedulesAfter"
  >;
  readonly resolveTimeZone: Effect.Effect<string, PlanningCenterError>;
}

/**
 * Two pages of 100 upcoming schedules reach well past the 60 days the plan list shows, even
 * for someone on several teams every week; a longer list fails the read rather than leave
 * plans unmarked.
 */
const UPCOMING_SCHEDULE_PAGES = 2;

/** The signed-in account's Planning Center person id; null when it cannot be read. */
export const resolveCurrentUserPersonId = (
  request: Request,
  account: { id: string; accountId: string },
  dependencies: CurrentUserIdentityDependencies
): Effect.Effect<string | null> =>
  Effect.gen(function* readCurrentUserPersonId() {
    if (dependencies.isDevAuthBypassEnabled()) {
      const identity = yield* Effect.promise(
        async () => await dependencies.loadDevBypassIdentity()
      );
      return isNonEmptyString(identity.personId) ? identity.personId : null;
    }
    const identity = yield* Effect.promise(
      async () =>
        await dependencies.getPlanningCenterIdentityForAccount(request, account)
    );
    return extractPersonIdFromIdentitySub(identity?.sub ?? null);
  });

/**
 * Plans from today on (org calendar day, like the plan list) that the signed-in person is
 * scheduled on. It does not depend on which plans the browser has loaded, so the Services
 * list can ask for it alongside the plans instead of after them. Planning Center leaves
 * declined schedules out of this read.
 */
export const getCurrentUserScheduledPlanIds = (
  request: Request,
  account: { id: string; accountId: string },
  dependencies: CurrentUserScheduledPlansDependencies
): Effect.Effect<string[], PlanningCenterError> =>
  Effect.gen(function* readCurrentUserScheduledPlanIds() {
    const personId = yield* resolveCurrentUserPersonId(
      request,
      account,
      dependencies
    );
    if (!isNonEmptyString(personId)) {
      return [];
    }

    const orgTimeZone = yield* dependencies.resolveTimeZone;
    const response = yield* dependencies.peopleService.getPersonSchedulesAfter(
      personId,
      formatCalendarDayInTimeZone(new Date(), orgTimeZone),
      UPCOMING_SCHEDULE_PAGES
    );
    const planIds = new Set<string>();
    for (const schedule of response.data) {
      const planId = getRelatedPlanId(schedule);
      if (isNonEmptyString(planId)) {
        planIds.add(planId);
      }
    }
    return [...planIds];
  });
