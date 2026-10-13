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
export const readStoredServiceTypeIds = (
  raw: string | null
): string[] | null => {
  if (raw === null) {
    return null;
  }
  return Option.getOrNull(decodeServiceTypeIds(raw));
};
