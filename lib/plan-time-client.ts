import type { PlanTime } from "@/lib/types";

export interface SerializedPlanTime extends Omit<
  PlanTime,
  "startsAt" | "endsAt"
> {
  startsAt: string;
  endsAt: string | null;
}

export function serializePlanTime(planTime: PlanTime): SerializedPlanTime {
  return {
    ...planTime,
    startsAt: planTime.startsAt.toISOString(),
    endsAt: planTime.endsAt ? planTime.endsAt.toISOString() : null,
  };
}

export function serializePlanTimes(
  planTimes: PlanTime[]
): SerializedPlanTime[] {
  return planTimes.map(serializePlanTime);
}

export function hydratePlanTime(planTime: SerializedPlanTime): PlanTime {
  return {
    ...planTime,
    startsAt: new Date(planTime.startsAt),
    endsAt: planTime.endsAt ? new Date(planTime.endsAt) : null,
  };
}

export function hydratePlanTimes(planTimes: SerializedPlanTime[]): PlanTime[] {
  return planTimes.map(hydratePlanTime);
}
