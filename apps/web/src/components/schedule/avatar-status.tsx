import type { ReactNode } from "react";

import type { ScheduleStatusDotStatus } from "@/components/schedule/status-dot";
import { cn } from "@/lib/utils";

const statusDotClassName: Record<ScheduleStatusDotStatus, string> = {
  confirmed: "bg-status-confirmed",
  scheduled: "bg-status-scheduled",
  declined: "bg-status-declined",
};

/**
 * Marks an avatar with a person's schedule: a corner dot for this assignment's status,
 * and a blue ring when they also serve elsewhere on the plan. The two combine.
 */
export const AvatarStatus = ({
  status,
  alsoScheduled = false,
  children,
}: {
  status?: ScheduleStatusDotStatus | null;
  /** Scheduled for another position on the same plan. */
  alsoScheduled?: boolean;
  children: ReactNode;
}) => (
  <span
    className={cn(
      // `isolate` keeps the dot's z-index inside the avatar, so sticky headers cover it.
      "relative isolate inline-flex shrink-0 rounded-full",
      alsoScheduled &&
        "ring-status-info ring-offset-background ring-2 ring-offset-2"
    )}
  >
    {children}
    {status === null || status === undefined ? null : (
      <span
        aria-hidden
        className={cn(
          "ring-background absolute right-0 bottom-0 z-10 size-2.5 rounded-full ring-2",
          statusDotClassName[status]
        )}
      />
    )}
  </span>
);
