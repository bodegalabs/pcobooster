import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import type { CSSProperties, ReactNode } from "react";

import { RecommendationPopover } from "@/components/schedule/popovers/recommendation-popover";
import {
  Avatar,
  AvatarButton,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Item } from "@/components/ui/item";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type CandidateStatus =
  | "confirmed"
  | "scheduled"
  | "declined"
  | "blocked"
  | "available";

export type ScheduleSlotStatus = "confirmed" | "scheduled" | "declined";

const slotStatusRingClassName: Record<ScheduleSlotStatus, string> = {
  confirmed: "ring-status-confirmed",
  scheduled: "ring-status-scheduled",
  declined: "ring-status-declined",
};

const AvatarStatusRing = ({
  slotStatus,
  children,
}: {
  slotStatus?: ScheduleSlotStatus | null;
  children: ReactNode;
}): ReactNode => (
  <span
    className={cn(
      "inline-flex rounded-full",
      slotStatus !== null &&
        slotStatus !== undefined &&
        "ring-offset-background ring-2 ring-offset-2",
      slotStatus !== null &&
        slotStatus !== undefined &&
        slotStatusRingClassName[slotStatus]
    )}
  >
    {children}
  </span>
);

const recTone = (score: number): string => {
  if (score >= 80) {
    return "text-status-confirmed dark:text-status-confirmed";
  }
  if (score >= 50) {
    return "text-status-scheduled dark:text-status-scheduled";
  }
  return "text-status-declined dark:text-status-declined";
};

const recBar = (score: number): string => {
  if (score >= 80) {
    return "bg-status-confirmed-bright";
  }
  if (score >= 50) {
    return "bg-status-scheduled-bright";
  }
  return "bg-status-declined-bright";
};

export const ScheduleCandidateAvatar = ({
  person,
  statusLabel,
  slotStatus,
  isBlocked,
  isDeclined,
  isScheduledElsewhereOnPlan,
  selectedPlanAssignments,
}: {
  person: PersonWithAvailability;
  statusLabel: string;
  slotStatus?: ScheduleSlotStatus | null;
  isBlocked: boolean;
  isDeclined: boolean;
  isScheduledElsewhereOnPlan: boolean;
  selectedPlanAssignments: string[];
}) => {
  const initials =
    `${person.firstName?.[0] ?? ""}${person.lastName?.[0] ?? ""}` || "?";
  const avatarInner = (
    <>
      <AvatarImage
        src={person.photoThumbnailUrl ?? undefined}
        alt={person.fullName}
      />
      <AvatarFallback>{initials}</AvatarFallback>
    </>
  );
  const blockedAvatarTint = isBlocked ? (
    <span
      aria-hidden
      className="bg-destructive/[0.26] dark:bg-destructive/[0.2] pointer-events-none absolute inset-0 z-[1] rounded-full"
    />
  ) : null;

  if (isDeclined && !isBlocked) {
    const trimmedReason = person.selectedPlanDeclineReason?.trim() ?? "";
    const declineReason =
      trimmedReason.length > 0
        ? trimmedReason
        : "No note was saved with this decline in Planning Center.";
    return (
      <ResponsivePopover>
        <ResponsivePopoverTrigger
          render={
            <AvatarButton
              aria-label={`Decline reason for ${person.fullName}`}
              title="View decline reason"
            />
          }
        >
          <AvatarStatusRing slotStatus={slotStatus}>
            <Avatar aria-hidden>{avatarInner}</Avatar>
          </AvatarStatusRing>
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          title="Decline reason"
          align="start"
          side="right"
          sideOffset={8}
          className="w-auto max-w-[18rem]"
        >
          <div className="p-3">
            <p className="text-muted-foreground text-xs font-medium">
              Decline reason
            </p>
            <p className="text-foreground mt-1.5 leading-relaxed [overflow-wrap:anywhere]">
              {declineReason}
            </p>
          </div>
        </ResponsivePopoverContent>
      </ResponsivePopover>
    );
  }

  if (isScheduledElsewhereOnPlan) {
    const assignmentsLabel = `Also scheduled for: ${selectedPlanAssignments.join(", ")}`;
    return (
      <ResponsivePopover>
        <ResponsivePopoverTrigger
          render={
            <AvatarButton
              emphasis="info"
              aria-label={`${person.fullName}. ${assignmentsLabel}`}
              title={assignmentsLabel}
            />
          }
        >
          <Avatar aria-hidden>{avatarInner}</Avatar>
          {blockedAvatarTint}
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          title="Also scheduled"
          align="start"
          side="right"
          sideOffset={8}
          className="w-auto max-w-[16rem]"
        >
          <div className="p-3">
            <p className="text-foreground [overflow-wrap:anywhere]">
              <span className="text-foreground/90 font-medium">
                Also scheduled for:
              </span>{" "}
              <span className="text-muted-foreground dark:text-info-foreground/85">
                {selectedPlanAssignments.join(", ")}
              </span>
            </p>
          </div>
        </ResponsivePopoverContent>
      </ResponsivePopover>
    );
  }

  return (
    <AvatarStatusRing slotStatus={slotStatus}>
      <span className="relative inline-flex shrink-0 overflow-visible">
        <Avatar title={statusLabel || undefined}>{avatarInner}</Avatar>
        {blockedAvatarTint}
      </span>
    </AvatarStatusRing>
  );
};

export const ScheduleCandidateScore = ({
  person,
  percentage,
  pending = false,
}: {
  person: PersonWithAvailability;
  percentage: number | null;
  /** The score is still being computed from history and availability. */
  pending?: boolean;
}) => {
  if (percentage === null && pending) {
    return (
      <div className="flex justify-end" aria-label="Score loading">
        <Skeleton variant="text" className="h-3.5 w-10 sm:h-5" />
      </div>
    );
  }
  if (percentage === null) {
    return <div className="text-muted-foreground text-right text-xs">-</div>;
  }
  const progressStyle: CSSProperties & { "--recommendation-width": string } = {
    "--recommendation-width": `${Math.max(4, percentage)}%`,
  };
  return (
    <RecommendationPopover
      reasoning={person.recommendationReasoning}
      personId={person.id}
    >
      <Item
        size="row"
        className="sm:flex-col sm:items-end sm:gap-1.5"
        render={
          <button type="button" aria-label={`${percentage} percent fit`} />
        }
      >
        <span
          className={cn(
            "shrink-0 text-xs leading-none font-semibold tabular-nums sm:text-base",
            recTone(percentage)
          )}
        >
          {percentage}
          <span className="text-muted-foreground ml-0.5 text-xs font-normal">
            %
          </span>
        </span>
        <div className="bg-muted/50 h-1.5 w-full overflow-hidden rounded-full sm:h-1.5">
          <div
            className={cn(
              "recommendation-progress h-full rounded-full",
              recBar(percentage)
            )}
            style={progressStyle}
          />
        </div>
      </Item>
    </RecommendationPopover>
  );
};
