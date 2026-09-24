import type { PlanningCenterError } from "@pcobooster/api/planning-center/core-client";
import type { PlanningCenterCatalogService } from "@pcobooster/api/planning-center/services/catalog-service";
import {
  isNonEmptyString,
  isNumber,
  isString,
} from "@pcobooster/planning-center-models/json";
import type { ServiceType } from "@pcobooster/planning-center-models/types";
import { Effect } from "effect";

export const getServiceTypes = (
  catalogService: Pick<PlanningCenterCatalogService, "getServiceTypesCached">
): Effect.Effect<ServiceType[], PlanningCenterError> =>
  Effect.map(catalogService.getServiceTypesCached(), (rawServiceTypes) => {
    const serviceTypes: ServiceType[] = [];
    for (const raw of rawServiceTypes) {
      if (isNonEmptyString(raw.attributes.archived_at)) {
        continue;
      }
      serviceTypes.push({
        id: raw.id,
        name: isString(raw.attributes.name) ? raw.attributes.name : "",
        sequence: isNumber(raw.attributes.sequence)
          ? raw.attributes.sequence
          : 0,
      });
    }
    return serviceTypes.toSorted((a, b) => a.sequence - b.sequence);
  });
