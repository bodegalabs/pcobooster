import { addCalendarDaysToDayKey } from "@pcobooster/planning-center-models/calendar";
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

/** Start with 30 days, then extend either side in disjoint two-week windows. */
export const servicePlanWindows = (
  todayKey: string,
  history: number,
  future: number
): { startDay: string; days: "14" | "30" }[] =>
  Array.from({ length: history + future }, (_, index) => {
    const windowIndex = index - history;
    const offset =
      windowIndex <= 0 ? windowIndex * 14 : 30 + (windowIndex - 1) * 14;
    return {
      startDay: addCalendarDaysToDayKey(todayKey, offset),
      days: windowIndex === 0 ? "30" : "14",
    };
  });
