import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";

export interface UpdatePlanPersonTimesInput {
  serviceTypeId: string;
  planId: string;
  personId: string;
  planPersonId: string;
  planTimeIds: string[];
}

export interface UpdatePlanPersonTimesDependencies {
  peopleService: Pick<
    PlanningCenterPeopleService,
    | "updatePlanPersonTimes"
    | "invalidatePlanTimeSensitiveReadCaches"
    | "getCacheScope"
  >;
  invalidateHistory: (cacheScope: string) => void;
}

export const updatePlanPersonTimes = async (
  {
    serviceTypeId,
    planId,
    personId,
    planPersonId,
    planTimeIds,
  }: UpdatePlanPersonTimesInput,
  dependencies: UpdatePlanPersonTimesDependencies
) => {
  const result = await dependencies.peopleService.updatePlanPersonTimes({
    serviceTypeId,
    planId,
    personId,
    planPersonId,
    planTimeIds,
  });
  dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(planId);
  dependencies.invalidateHistory(dependencies.peopleService.getCacheScope());
  return result;
};
