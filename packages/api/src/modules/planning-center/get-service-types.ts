import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import {
  isNonEmptyString,
  isNumber,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { ServiceType } from "@pcobooster/planning-center-models/types";

export const getServiceTypes = async (
  catalogService: Pick<PlanningCenterCatalogService, "getServiceTypesCached">,
  signal?: AbortSignal
): Promise<ServiceType[]> => {
  const rawServiceTypes = await catalogService.getServiceTypesCached(
    undefined,
    signal
  );
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
