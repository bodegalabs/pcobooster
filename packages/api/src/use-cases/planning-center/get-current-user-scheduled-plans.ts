import {
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@worship-admin/api/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@worship-admin/api/auth/planning-center-account-identity";
import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import {
  isNonEmptyString,
  isString,
} from "@worship-admin/planning-center-models/json";
import type { PCResource } from "@worship-admin/planning-center-models/types";

const extractPersonIdFromIdentitySub = (sub: string | null): string | null => {
  if (!isNonEmptyString(sub)) {
    return null;
  }
  const trimmed = sub.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[A-Za-z0-9_-]+$/u.test(trimmed)) {
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

const isScheduledStatus = (status: string | undefined): boolean => {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized !== "declined" && normalized !== "d";
};

export interface CurrentUserScheduledPlansDependencies {
  readonly isDevAuthBypassEnabled: typeof isDevAuthBypassEnabled;
  readonly loadDevBypassIdentity: typeof loadDevBypassIdentity;
  readonly getPlanningCenterIdentityForAccount: typeof getPlanningCenterIdentityForAccount;
  readonly peopleService: Pick<
    PlanningCenterPeopleService,
    "getPersonSchedules"
  >;
}

const defaultDependencies: CurrentUserScheduledPlansDependencies = {
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
  getPlanningCenterIdentityForAccount,
  peopleService: planningCenterPeopleService,
};

export const getCurrentUserScheduledPlanIds = async (
  request: Request,
  account: { id: string; accountId: string },
  planIds: string[],
  dependencies: CurrentUserScheduledPlansDependencies = defaultDependencies
): Promise<string[]> => {
  if (planIds.length === 0) {
    return [];
  }

  const requestedPlanIds = new Set(planIds);
  let personId: string | null;
  if (dependencies.isDevAuthBypassEnabled()) {
    const identity = await dependencies.loadDevBypassIdentity();
    ({ personId } = identity);
  } else {
    const identity = await dependencies.getPlanningCenterIdentityForAccount(
      request,
      account
    );
    personId = extractPersonIdFromIdentitySub(identity?.sub ?? null);
  }
  if (!isNonEmptyString(personId)) {
    return [];
  }

  const response = await dependencies.peopleService.getPersonSchedules(
    personId,
    { order: "-starts_at" },
    5
  );

  const matchedPlanIds = new Set<string>();

  for (const schedule of response.data) {
    if (
      !isScheduledStatus(
        isString(schedule.attributes.status)
          ? schedule.attributes.status
          : undefined
      )
    ) {
      continue;
    }

    const planId = getRelatedPlanId(schedule);
    if (!isNonEmptyString(planId) || !requestedPlanIds.has(planId)) {
      continue;
    }
    matchedPlanIds.add(planId);

    if (matchedPlanIds.size === requestedPlanIds.size) {
      break;
    }
  }

  return [...matchedPlanIds];
};
