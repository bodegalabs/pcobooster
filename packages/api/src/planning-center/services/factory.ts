import { PlanningCenterCoreClient } from "@worship-admin/api/planning-center/core-client";
import { PlanningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import { PlanningCenterPeopleService } from "@worship-admin/api/planning-center/services/people-service";
import { PlanningCenterPlanItemsService } from "@worship-admin/api/planning-center/services/plan-items-service";
import { PlanningCenterPlansService } from "@worship-admin/api/planning-center/services/plans-service";
import { PlanningCenterSongsService } from "@worship-admin/api/planning-center/services/songs-service";

export const createPlanningCenterServices = (accessToken: string) => {
  const core = new PlanningCenterCoreClient({
    accessToken,
  });

  return {
    core,
    catalog: new PlanningCenterCatalogService(core),
    people: new PlanningCenterPeopleService(core),
    planItems: new PlanningCenterPlanItemsService(core),
    plans: new PlanningCenterPlansService(core),
    songs: new PlanningCenterSongsService(core),
  };
};
