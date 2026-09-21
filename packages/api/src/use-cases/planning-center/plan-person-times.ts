import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import type { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { invalidatePlanWindowHistory } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";

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

const defaultDependencies: UpdatePlanPersonTimesDependencies = {
  peopleService: planningCenterPeopleService,
  invalidateHistory: invalidatePlanWindowHistory,
};

export const updatePlanPersonTimes = async (
  {
    serviceTypeId,
    planId,
    personId,
    planPersonId,
    planTimeIds,
  }: UpdatePlanPersonTimesInput,
  dependencies: UpdatePlanPersonTimesDependencies = defaultDependencies
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
