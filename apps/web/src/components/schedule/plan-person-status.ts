import type { FilledPositionPerson } from "@worship-admin/planning-center-models/types";

import type { ScheduleStatusDotStatus } from "@/components/schedule/status-dot";
import type { PlanPersonStatusCode } from "@/hooks/use-update-plan-person-status";

export type PlanPersonStatusValue = "confirmed" | "scheduled" | "declined";

export const STATUS_TO_CODE: Record<
  PlanPersonStatusValue,
  PlanPersonStatusCode
> = {
  confirmed: "C",
  scheduled: "U",
  declined: "D",
};

export const STATUS_ITEMS: {
  value: PlanPersonStatusValue;
  label: string;
  status: ScheduleStatusDotStatus;
}[] = [
  {
    value: "confirmed",
    label: "Confirmed",
    status: "confirmed",
  },
  {
    value: "scheduled",
    label: "Pending",
    status: "scheduled",
  },
  {
    value: "declined",
    label: "Declined",
    status: "declined",
  },
];

export const getPlanPersonStatusValue = (
  person: Pick<FilledPositionPerson, "status" | "rawStatus">
): PlanPersonStatusValue => {
  const raw = (person.rawStatus ?? "").trim().toLowerCase();
  if (raw === "c" || raw === "confirmed") {
    return "confirmed";
  }
  if (raw === "d" || raw.includes("declined") || raw.includes("removed")) {
    return "declined";
  }
  return person.status === "confirmed" ? "confirmed" : "scheduled";
};

export const getPlanPersonStatusMeta = (
  status: PlanPersonStatusValue
): (typeof STATUS_ITEMS)[number] =>
  STATUS_ITEMS.find((item) => item.value === status) ?? STATUS_ITEMS[1];
