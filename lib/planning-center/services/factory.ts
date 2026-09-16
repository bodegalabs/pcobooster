import { PlanningCenterCoreClient } from "@/lib/planning-center/core-client";
import { PlanningCenterCatalogService } from "@/lib/planning-center/services/catalog-service";
import { PlanningCenterPeopleService } from "@/lib/planning-center/services/people-service";
import { PlanningCenterPlanItemsService } from "@/lib/planning-center/services/plan-items-service";
import { PlanningCenterPlansService } from "@/lib/planning-center/services/plans-service";
import { PlanningCenterSongsService } from "@/lib/planning-center/services/songs-service";

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
