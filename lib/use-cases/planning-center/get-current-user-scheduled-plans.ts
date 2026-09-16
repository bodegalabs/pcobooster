import {
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@/lib/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@/lib/auth/planning-center-account-identity";
import { isNonEmptyString, isString } from "@/lib/json";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { PCResource } from "@/lib/types";

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

export const getCurrentUserScheduledPlanIds = async (
  request: Request,
  accountId: string,
  planIds: string[]
): Promise<string[]> => {
  if (planIds.length === 0) {
    return [];
  }

  const requestedPlanIds = new Set(planIds);
  let personId: string | null;
  if (isDevAuthBypassEnabled()) {
    const identity = await loadDevBypassIdentity();
    ({ personId } = identity);
  } else {
    const identity = await getPlanningCenterIdentityForAccount(
      request,
      accountId
    );
    personId = extractPersonIdFromIdentitySub(identity?.sub ?? null);
  }
  if (!isNonEmptyString(personId)) {
    return [];
  }

  const response = await planningCenterPeopleService.getPersonSchedules(
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
