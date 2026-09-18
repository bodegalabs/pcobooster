"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** Keep in sync with `status-dot-pulse` duration in `app/globals.css`. */
const STATUS_DOT_DURATION_MS = 2400;

export type ScheduleStatusDotStatus = "confirmed" | "scheduled" | "declined";

const statusColorClasses: Record<ScheduleStatusDotStatus, string> = {
  confirmed: "bg-status-confirmed",
  scheduled: "bg-status-scheduled",
  declined: "bg-status-declined",
};

export interface ScheduleStatusDotProps {
  status: ScheduleStatusDotStatus;
  className?: string;
  "aria-label"?: string;
  "aria-hidden"?: boolean;
}

export const ScheduleStatusDot = ({
  status,
  className,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}: ScheduleStatusDotProps) => {
  const dotRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = dotRef.current;
    if (!node) {
      return;
    }

    node.style.animationDelay = `${-(performance.now() % STATUS_DOT_DURATION_MS)}ms`;
  }, []);

  return (
    <span
      ref={dotRef}
      className={cn(
        "animate-status-dot size-2.5 shrink-0 rounded-full",
        statusColorClasses[status],
        className
      )}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden ?? (ariaLabel === undefined ? true : undefined)}
    />
  );
};
