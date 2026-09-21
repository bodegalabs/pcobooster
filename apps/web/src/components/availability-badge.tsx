import { blockoutCoversPlanSortInstant } from "@worship-admin/planning-center-models/calendar-day";
import type {
  AvailabilityStatus,
  Blockout,
} from "@worship-admin/planning-center-models/types";

import { Badge } from "@/components/ui/badge";

interface AvailabilityBadgeProps {
  blockouts: Blockout[];
  checkDate?: Date;
}

const variants = {
  available: "default",
  blocked: "destructive",
  unknown: "secondary",
} as const;

const labels = {
  available: "Available",
  blocked: "Blocked Out",
  unknown: "Unknown",
};

const getAvailabilityStatus = (
  blockouts: Blockout[],
  checkDate: Date
): AvailabilityStatus => {
  if (blockouts.length === 0) {
    return "available";
  }
  const isBlocked = blockouts.some((blockout) =>
    blockoutCoversPlanSortInstant(checkDate, {
      startsAt: new Date(blockout.startsAt),
      endsAt: new Date(blockout.endsAt),
      timeZone: blockout.timeZone,
    })
  );
  return isBlocked ? "blocked" : "available";
};

export const AvailabilityBadge = ({
  blockouts,
  checkDate,
}: AvailabilityBadgeProps) => {
  const status = getAvailabilityStatus(blockouts, checkDate ?? new Date());

  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
};
