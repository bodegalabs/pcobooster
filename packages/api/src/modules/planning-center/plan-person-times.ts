import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterPeopleService } from "@pcobooster/api/planning-center/services/people-service";
import type { PCResource } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

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

export const updatePlanPersonTimes = (
  {
    serviceTypeId,
    planId,
    personId,
    planPersonId,
    planTimeIds,
  }: UpdatePlanPersonTimesInput,
  dependencies: UpdatePlanPersonTimesDependencies
): Effect.Effect<PCResource, PlanningCenterError> =>
  dependencies.peopleService
    .updatePlanPersonTimes({
      serviceTypeId,
      planId,
      personId,
      planPersonId,
      planTimeIds,
    })
    .pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          dependencies.peopleService.invalidatePlanTimeSensitiveReadCaches(
            planId
          );
          dependencies.invalidateHistory(
            dependencies.peopleService.getCacheScope()
          );
        })
      )
    );
