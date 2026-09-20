import { planningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import type { PlanningCenterCatalogService } from "@worship-admin/api/planning-center/services/catalog-service";
import {
  isNonEmptyString,
  isNumber,
  isString,
} from "@worship-admin/planning-center-models/json";
import type { ServiceType } from "@worship-admin/planning-center-models/types";

export const getServiceTypes = async (
  catalogService: Pick<
    PlanningCenterCatalogService,
    "getServiceTypesCached"
  > = planningCenterCatalogService
): Promise<ServiceType[]> => {
  const rawServiceTypes = await catalogService.getServiceTypesCached();
  const serviceTypes: ServiceType[] = [];
  for (const raw of rawServiceTypes) {
    if (isNonEmptyString(raw.attributes.archived_at)) {
      continue;
    }
    serviceTypes.push({
      id: raw.id,
      name: isString(raw.attributes.name) ? raw.attributes.name : "",
      sequence: isNumber(raw.attributes.sequence) ? raw.attributes.sequence : 0,
    });
  }
  return serviceTypes.toSorted((a, b) => a.sequence - b.sequence);
};
