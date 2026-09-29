import type { ReactNode } from "react";

import type { ScheduleStatusDotStatus } from "@/components/schedule/status-dot";
import { cn } from "@/lib/utils";

const statusRingClassName: Record<ScheduleStatusDotStatus, string> = {
  confirmed: "ring-status-confirmed",
  scheduled: "ring-status-scheduled",
  declined: "ring-status-declined",
};

/** Rings an avatar in a person's schedule status color; no status leaves it bare. */
export const AvatarStatusRing = ({
  status,
  children,
}: {
  status?: ScheduleStatusDotStatus | null;
  children: ReactNode;
}) => (
  <span
    className={cn(
      "inline-flex shrink-0 rounded-full",
      status !== null &&
        status !== undefined && [
          "ring-offset-background ring-2 ring-offset-2",
          statusRingClassName[status],
        ]
    )}
  >
    {children}
  </span>
);
