import type { PlanTime } from "@/lib/types";

export interface SerializedPlanTime extends Omit<
  PlanTime,
  "startsAt" | "endsAt"
> {
  startsAt: string;
  endsAt: string | null;
}

export const serializePlanTime = (planTime: PlanTime): SerializedPlanTime => ({
  ...planTime,
  startsAt: planTime.startsAt.toISOString(),
  endsAt: planTime.endsAt ? planTime.endsAt.toISOString() : null,
});

export const serializePlanTimes = (
  planTimes: PlanTime[]
): SerializedPlanTime[] => planTimes.map(serializePlanTime);

export const hydratePlanTime = (planTime: SerializedPlanTime): PlanTime => ({
  ...planTime,
  startsAt: new Date(planTime.startsAt),
  endsAt:
    planTime.endsAt !== null && planTime.endsAt !== ""
      ? new Date(planTime.endsAt)
      : null,
});

export const hydratePlanTimes = (planTimes: SerializedPlanTime[]): PlanTime[] =>
  planTimes.map(hydratePlanTime);
