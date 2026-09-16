import {
  planningCenterCatalogService,
  type PlanningCenterCatalogService,
} from "@/lib/planning-center/services/catalog-service";
import type { RawServiceType, ServiceType } from "@/lib/types";

export async function getServiceTypes(
  catalogService: Pick<
    PlanningCenterCatalogService,
    "getServiceTypesCached"
  > = planningCenterCatalogService
): Promise<ServiceType[]> {
  const rawServiceTypes = await catalogService.getServiceTypesCached();
  const activeRawServiceTypes = rawServiceTypes.filter((raw) => {
    const archivedAt = (raw.attributes.archived_at as string | null) || null;
    return !archivedAt;
  });

  const serviceTypes: ServiceType[] = activeRawServiceTypes
    .map((raw) => {
      const st = raw as unknown as RawServiceType;
      return {
        id: st.id,
        name: st.attributes.name as string,
        sequence: st.attributes.sequence as number,
      };
    })
    .sort((a, b) => a.sequence - b.sequence);

  return serviceTypes;
}
