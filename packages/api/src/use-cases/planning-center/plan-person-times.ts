import { planningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { invalidatePlanWindowHistory } from "@worship-admin/api/use-cases/planning-center/get-people-for-position";

export interface UpdatePlanPersonTimesInput {
  serviceTypeId: string;
  planId: string;
  personId: string;
  planPersonId: string;
  planTimeIds: string[];
}

export const updatePlanPersonTimes = async ({
  serviceTypeId,
  planId,
  personId,
  planPersonId,
  planTimeIds,
}: UpdatePlanPersonTimesInput) => {
  const result = await planningCenterPeopleService.updatePlanPersonTimes({
    serviceTypeId,
    planId,
    personId,
    planPersonId,
    planTimeIds,
  });
  planningCenterPeopleService.invalidatePlanTimeSensitiveReadCaches(planId);
  invalidatePlanWindowHistory();
  return result;
};
