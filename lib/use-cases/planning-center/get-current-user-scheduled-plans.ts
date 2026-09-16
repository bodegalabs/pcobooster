import {
  isDevAuthBypassEnabled,
  loadDevBypassIdentity,
} from "@/lib/auth/dev-bypass";
import { getPlanningCenterIdentityForAccount } from "@/lib/auth/planning-center-identity";
import { planningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import type { RawSchedule } from "@/lib/types";

function extractPersonIdFromIdentitySub(sub: string | null): string | null {
  if (!sub) return null;
  const trimmed = sub.trim();
  if (!trimmed) return null;

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
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
}

function getRelatedPlanId(schedule: RawSchedule): string | null {
  const planRel = schedule.relationships?.plan?.data;
  if (!planRel || Array.isArray(planRel)) return null;
  return planRel.id || null;
}

function isScheduledStatus(status: string | undefined): boolean {
  const normalized = (status || "").trim().toLowerCase();
  return normalized !== "declined" && normalized !== "d";
}

export async function getCurrentUserScheduledPlanIds(
  request: Request,
  accountId: string,
  planIds: string[]
): Promise<string[]> {
  if (planIds.length === 0) return [];

  const requestedPlanIds = new Set(planIds);
  const personId = isDevAuthBypassEnabled()
    ? (await loadDevBypassIdentity()).personId
    : extractPersonIdFromIdentitySub(
        (await getPlanningCenterIdentityForAccount(request, accountId))?.sub ??
          null
      );
  if (!personId) return [];

  const response = await planningCenterPeopleService.getPersonSchedules(
    personId,
    { order: "-starts_at" },
    5
  );

  const schedules = response.data as unknown as RawSchedule[];
  const matchedPlanIds = new Set<string>();

  for (const schedule of schedules) {
    if (!isScheduledStatus(schedule.attributes.status as string | undefined))
      continue;

    const planId = getRelatedPlanId(schedule);
    if (!planId || !requestedPlanIds.has(planId)) continue;
    matchedPlanIds.add(planId);

    if (matchedPlanIds.size === requestedPlanIds.size) {
      break;
    }
  }

  return [...matchedPlanIds];
}
