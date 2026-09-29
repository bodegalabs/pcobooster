import type { ReactNode } from "react";

import type { ScheduleStatusDotStatus } from "@/components/schedule/status-dot";
import { cn } from "@/lib/utils";

const statusDotClassName: Record<ScheduleStatusDotStatus, string> = {
  confirmed: "bg-status-confirmed",
  scheduled: "bg-status-scheduled",
  declined: "bg-status-declined",
};

/** Marks an avatar's corner with a person's schedule status; no status leaves it bare. */
export const AvatarStatus = ({
  status,
  children,
}: {
  status?: ScheduleStatusDotStatus | null;
  children: ReactNode;
}) => (
  <span className="relative inline-flex shrink-0 rounded-full">
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
