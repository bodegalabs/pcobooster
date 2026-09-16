"use client";

import { CalendarPlus, Info, Loader2 } from "lucide-react";

import {
  PlanPersonStatusMenu,
  type PlanPersonStatusValue,
} from "@/components/schedule/plan-person-status-menu";
import { RecommendationPopover } from "@/components/schedule/popovers/recommendation-popover";
import { ScheduleContextPopover } from "@/components/schedule/popovers/schedule-context-popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSchedulePlanPerson } from "@/hooks/use-schedule-plan-person";
import type { PersonWithAvailability } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatusVariant =
  | "confirmed"
  | "scheduled"
  | "declined"
  | "blocked"
  | "available";

const STATUS_META: Record<StatusVariant, { label: string }> = {
  confirmed: { label: "Confirmed" },
  scheduled: { label: "On slot" },
  declined: { label: "Declined" },
  blocked: { label: "Blocked" },
  available: { label: "" },
};

function recTone(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-700 dark:text-amber-400";
  return "text-orange-700 dark:text-orange-400";
}

function recBar(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-orange-500";
}

/** Sentinel kept for compatibility with strip skeleton/layout; rows now flow vertically. */
export const SCHEDULE_STRIP_MIN_HEIGHT_CLASS = "";

export interface ScheduleCandidateTileProps {
  person: PersonWithAvailability;
  serviceTypeId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  teamName?: string | null;
  positionName?: string | null;
  oneOff?: boolean;
  onScheduleSuccess?: () => void;
  onScheduleError?: (message: string) => void;
}

export function ScheduleCandidateTile({
  person,
  serviceTypeId,
  planId,
  teamId,
  positionId,
  teamName,
  positionName,
  oneOff = false,
  onScheduleSuccess,
  onScheduleError,
}: ScheduleCandidateTileProps) {
  const isConfirmed = !!person.isConfirmedForSelectedPlanPosition;
  const isDeclined = !!person.isDeclinedForSelectedPlanPosition;
  const isBlocked = !!person.isBlockedForDate;
  const fromServerScheduled =
    !!person.isScheduledForSelectedPlanPosition || isConfirmed;

  const missingSelection = !serviceTypeId || !planId || !teamId || !positionId;
  const canScheduleForHook =
    !missingSelection && !isBlocked && !isDeclined && !fromServerScheduled;

  const { isScheduling, scheduleSuccess, scheduleError, handleSchedule } =
    useSchedulePlanPerson({
      serviceTypeId,
      planId,
      teamId,
      positionId,
      teamName,
      positionName,
      canSchedule: canScheduleForHook,
      onScheduleSuccess,
      onScheduleError,
      oneOff,
    });

  const isScheduled = fromServerScheduled || scheduleSuccess;

  const selectedPlanAssignments = person.selectedPlanAssignmentLabels ?? [];
  const isScheduledElsewhereOnPlan =
    !isScheduled && !isDeclined && selectedPlanAssignments.length > 0;

  const statusVariant: StatusVariant = isBlocked
    ? "blocked"
    : isDeclined
      ? "declined"
      : isConfirmed
        ? "confirmed"
        : isScheduled
          ? "scheduled"
          : "available";
  const statusMeta = STATUS_META[statusVariant];

  const isUnavailableForSlot = isBlocked || isDeclined;
  const unavailableSlotLabel = isBlocked
    ? "Blocked"
    : isDeclined
      ? "Declined"
      : null;

  const recommendationPercentage =
    isBlocked || person.recommendationScore === undefined
      ? null
      : Math.round(person.recommendationScore);

  const disableReason = missingSelection
    ? "Select service type, plan, team, and position to schedule"
    : isBlocked
      ? "Person is blocked for this date"
      : isDeclined
        ? "Person declined this position"
        : isScheduled
          ? "Already scheduled for this selected plan and position"
          : undefined;

  const canSchedule = !disableReason;

  const initials =
    `${person.firstName?.[0] ?? ""}${person.lastName?.[0] ?? ""}` || "?";

  const serviceHistory = person.serviceHistory ?? [];

  const statusRing =
    statusVariant === "confirmed"
      ? "ring-2 ring-emerald-500/80 ring-offset-2 ring-offset-background"
      : statusVariant === "scheduled"
        ? "ring-2 ring-amber-500/80 ring-offset-2 ring-offset-background"
        : statusVariant === "declined"
          ? "ring-2 ring-red-500/70 ring-offset-2 ring-offset-background"
          : "";

  const blockedAvatarTint = isBlocked ? (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] rounded-full bg-red-500/[0.26] dark:bg-red-500/[0.2]"
    />
  ) : null;

  const elsewhereAssignmentsLabel = `Also scheduled for: ${selectedPlanAssignments.join(", ")}`;
  const elsewhereAvatarAriaLabel = `${person.fullName}. ${elsewhereAssignmentsLabel}`;

  const planElsewherePopover = (
    <PopoverContent
      align="start"
      side="right"
      sideOffset={8}
      collisionPadding={16}
      className="w-auto max-w-[16rem] border-dashed border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs leading-snug shadow-sm dark:border-blue-800 dark:bg-blue-950"
    >
      <p className="text-foreground [overflow-wrap:anywhere]">
        <span className="text-foreground/90 font-medium">
          Also scheduled for:
        </span>{" "}
        <span className="text-muted-foreground dark:text-blue-100/85">
          {selectedPlanAssignments.join(", ")}
        </span>
      </p>
    </PopoverContent>
  );

  const showDeclinedAvatarPopover = isDeclined && !isBlocked;
  const trimmedDeclineReason = person.selectedPlanDeclineReason?.trim() ?? "";
  const declineReasonBody =
    trimmedDeclineReason.length > 0
      ? trimmedDeclineReason
      : "No note was saved with this decline in Planning Center.";
  const planDeclineReasonPopover = (
    <PopoverContent
      align="start"
      side="right"
      sideOffset={8}
      collisionPadding={16}
      className="border-border/60 bg-popover w-auto max-w-[18rem] border px-3 py-2.5 text-sm leading-snug shadow-md"
    >
      <p className="text-muted-foreground text-xs font-medium">
        Decline reason
      </p>
      <p className="text-foreground mt-1.5 leading-relaxed [overflow-wrap:anywhere]">
        {declineReasonBody}
      </p>
    </PopoverContent>
  );

  const avatarInner = (
    <>
      <AvatarImage
        src={person.photoThumbnailUrl || undefined}
        alt={person.fullName}
      />
      <AvatarFallback className="bg-muted text-xs font-medium">
        {initials}
      </AvatarFallback>
    </>
  );

  return (
    <article
      className={cn(
        "group/row relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 px-3 py-2.5 transition-colors sm:flex sm:gap-4 sm:py-3",
        "hover:bg-muted/30"
      )}
    >
      {showDeclinedAvatarPopover ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative inline-flex shrink-0 cursor-pointer overflow-visible rounded-full border-0 bg-transparent p-0",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              )}
              aria-label={`Decline reason for ${person.fullName}`}
              title="View decline reason"
            >
              <Avatar
                className={cn("size-8 sm:size-9", statusRing)}
                aria-hidden
              >
                {avatarInner}
              </Avatar>
            </button>
          </PopoverTrigger>
          {planDeclineReasonPopover}
        </Popover>
      ) : isScheduledElsewhereOnPlan ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative shrink-0 cursor-pointer overflow-visible rounded-full border-0 bg-transparent p-0",
                "outline-2 outline-offset-2 outline-blue-500 outline-dashed",
                "hover:outline-blue-600 dark:outline-blue-400 dark:hover:outline-blue-300",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              )}
              aria-label={elsewhereAvatarAriaLabel}
              title={elsewhereAssignmentsLabel}
            >
              <Avatar
                className={cn("size-8 sm:size-9", statusRing)}
                aria-hidden
              >
                {avatarInner}
              </Avatar>
              {blockedAvatarTint}
            </button>
          </PopoverTrigger>
          {planElsewherePopover}
        </Popover>
      ) : (
        <span className="relative inline-flex shrink-0 overflow-visible">
          <Avatar
            className={cn("size-8 sm:size-9", statusRing)}
            title={statusMeta.label || undefined}
          >
            {avatarInner}
          </Avatar>
          {blockedAvatarTint}
        </span>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-1">
        <p
          className={cn(
            "text-foreground min-w-0 truncate text-sm leading-tight font-medium sm:text-base",
            isUnavailableForSlot && "text-muted-foreground line-through"
          )}
        >
          {person.fullName}
        </p>
        {unavailableSlotLabel ? (
          <span
            className={cn(
              "shrink-0 text-[0.65rem] font-semibold tracking-wide uppercase",
              isBlocked
                ? "text-amber-800 dark:text-amber-400"
                : "text-red-700 dark:text-red-400"
            )}
          >
            {unavailableSlotLabel}
          </span>
        ) : null}
        <ScheduleContextPopover serviceHistory={serviceHistory}>
          <button
            type="button"
            className="text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground inline-flex size-6 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-md border-0 bg-transparent p-0 sm:size-8"
            aria-label="Schedule context"
          >
            <Info className="size-4" />
          </button>
        </ScheduleContextPopover>
      </div>

      <div className="col-span-2 col-start-2 row-start-2 min-w-0 sm:col-auto sm:row-auto sm:block sm:w-28 sm:shrink-0">
        {recommendationPercentage !== null ? (
          <RecommendationPopover
            reasoning={person.recommendationReasoning}
            personId={person.id}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left sm:flex-col sm:items-end sm:gap-1.5 sm:text-right"
              aria-label={`${recommendationPercentage} percent fit`}
            >
              <span
                className={cn(
                  "shrink-0 text-xs leading-none font-semibold tabular-nums sm:text-base",
                  recTone(recommendationPercentage)
                )}
              >
                {recommendationPercentage}
                <span className="text-muted-foreground ml-0.5 text-[11px] font-normal">
                  %
                </span>
              </span>
              <div className="bg-muted/50 h-1.5 w-full overflow-hidden rounded-full sm:h-1.5">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    recBar(recommendationPercentage)
                  )}
                  style={{ width: `${Math.max(4, recommendationPercentage)}%` }}
                />
              </div>
            </button>
          </RecommendationPopover>
        ) : (
          <div className="text-muted-foreground text-right text-xs">—</div>
        )}
      </div>

      <div className="col-start-3 row-span-2 row-start-1 flex w-9 shrink-0 justify-end sm:row-auto sm:w-20">
        {!isScheduled ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 gap-1.5 px-0 sm:w-full sm:px-3"
            disabled={!canSchedule || isScheduling}
            onClick={() => handleSchedule(person)}
            title={disableReason}
          >
            {isScheduling ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span className="hidden sm:inline">Adding</span>
              </>
            ) : (
              <>
                <CalendarPlus className="size-3.5 opacity-70" />
                <span className="hidden sm:inline">Add</span>
              </>
            )}
          </Button>
        ) : (
          <PlanPersonStatusMenu
            planPersonId={person.scheduledPlanPersonId}
            serviceTypeId={serviceTypeId}
            personId={person.id}
            planId={planId}
            teamId={teamId}
            positionId={positionId}
            currentStatus={
              (isConfirmed
                ? "confirmed"
                : isDeclined
                  ? "declined"
                  : "scheduled") satisfies PlanPersonStatusValue
            }
            onSuccess={onScheduleSuccess}
            onError={onScheduleError}
          />
        )}
      </div>

      {scheduleError ? (
        <p className="text-destructive col-span-2 col-start-2 text-[10px] sm:absolute sm:-bottom-1 sm:left-14">
          {scheduleError}
        </p>
      ) : null}
    </article>
  );
}
