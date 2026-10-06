import type { DateRangeFilter } from "@pcobooster/planning-center-models/service-plans";
import { z } from "zod";

export interface ServicePlanTableSelectorProps {
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  /** True while the selected plan's route is loading. */
  isNavigating?: boolean;
  onSelect: (selection: { serviceTypeId: string; planId: string }) => void;
}

export const SERVICE_TYPE_FILTER_STORAGE_KEY =
  "schedule:selected-service-type-ids";

const serviceTypeIdsSchema = z.array(z.string());
export const dateRangeSchema = z.enum([
  "all",
  "14",
  "30",
  "60",
] as const satisfies readonly DateRangeFilter[]);
export const readStoredServiceTypeIds = (
  raw: string | null
): string[] | null => {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = serviceTypeIdsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
