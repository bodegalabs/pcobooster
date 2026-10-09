import type { DateRangeFilter } from "@pcobooster/planning-center-models/service-plans";
import { Option, Schema } from "effect";

export interface ServicePlanTableSelectorProps {
  selectedServiceTypeId: string | null;
  selectedPlanId: string | null;
  /** True while the selected plan's route is loading. */
  isNavigating?: boolean;
  onSelect: (selection: { serviceTypeId: string; planId: string }) => void;
}

export const SERVICE_TYPE_FILTER_STORAGE_KEY =
  "schedule:selected-service-type-ids";

const decodeServiceTypeIds = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.mutable(Schema.Array(Schema.String)))
);
/** The date range a filter control chose; anything else is a programming error and throws. */
export const parseDateRange = Schema.decodeUnknownSync(
  Schema.Literals([
    "all",
    "14",
    "30",
    "60",
  ] as const satisfies readonly DateRangeFilter[])
);
export const readStoredServiceTypeIds = (
  raw: string | null
): string[] | null => {
  if (raw === null) {
    return null;
  }
  return Option.getOrNull(decodeServiceTypeIds(raw));
};
