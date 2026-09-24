import { isNonEmptyString } from "@pcobooster/planning-center-models/json";
import type { PersonWithAvailability } from "@pcobooster/planning-center-models/types";
import { CalendarPlus, Info, Loader2 } from "lucide-react";

import { PlanPersonStatusMenu } from "@/components/schedule/plan-person-status-menu";
import type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status-menu";
import { ScheduleContextPopover } from "@/components/schedule/popovers/schedule-context-popover";
import {
  ScheduleCandidateAvatar,
  ScheduleCandidateScore,
} from "@/components/schedule/schedule-candidate-details";
import type { CandidateStatus } from "@/components/schedule/schedule-candidate-details";
import { Button } from "@/components/ui/button";
import { useSchedulePlanPerson } from "@/hooks/use-schedule-plan-person";
import { cn } from "@/lib/utils";

const STATUS_META: Record<CandidateStatus, { label: string }> = {
  confirmed: { label: "Confirmed" },
  scheduled: { label: "On slot" },
  declined: { label: "Declined" },
  blocked: { label: "Blocked" },
  available: { label: "" },
};

const getStatusVariant = (
  isBlocked: boolean,
  isDeclined: boolean,
  isConfirmed: boolean,
  isScheduled: boolean
): CandidateStatus => {
  if (isBlocked) {
    return "blocked";
  }
  if (isDeclined) {
    return "declined";
  }
  if (isConfirmed) {
    return "confirmed";
  }
  if (isScheduled) {
    return "scheduled";
  }
  return "available";
};

const getDisableReason = (
  missingSelection: boolean,
  isBlocked: boolean,
  isDeclined: boolean,
  isScheduled: boolean
): string | undefined => {
  if (missingSelection) {
    return "Select service type, plan, team, and position to schedule";
  }
  if (isBlocked) {
    return "Person is blocked for this date";
  }
  if (isDeclined) {
    return "Person declined this position";
  }
  if (isScheduled) {
    return "Already scheduled for this selected plan and position";
  }
  return undefined;
};

const getCurrentStatus = (
  isConfirmed: boolean,
  isDeclined: boolean
): PlanPersonStatusValue => {
  if (isConfirmed) {
    return "confirmed";
  }
  if (isDeclined) {
    return "declined";
  }
  return "scheduled";
};

const getSlotStatus = (
  isScheduled: boolean,
  isConfirmed: boolean,
  isDeclined: boolean
): PlanPersonStatusValue | null => {
  if (!isScheduled) {
    return null;
  }
  return getCurrentStatus(isConfirmed, isDeclined);
};

const ScheduleCandidateAction = ({
  person,
  serviceTypeId,
  planId,
  teamId,
  positionId,
  isScheduled,
  isConfirmed,
  isDeclined,
  isScheduling,
  canSchedule,
  disableReason,
  onSchedule,
  onScheduleSuccess,
  onScheduleError,
}: {
  person: PersonWithAvailability;
  serviceTypeId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  isScheduled: boolean;
  isConfirmed: boolean;
  isDeclined: boolean;
  isScheduling: boolean;
  canSchedule: boolean;
  disableReason?: string;
  onSchedule: () => void;
  onScheduleSuccess?: () => void;
  onScheduleError?: (message: string) => void;
}) => (
  <div className="col-start-3 row-span-2 row-start-1 flex w-10 shrink-0 justify-end sm:row-auto sm:w-20">
    {isScheduled ? (
      <PlanPersonStatusMenu
        planPersonId={person.scheduledPlanPersonId}
        serviceTypeId={serviceTypeId}
        personId={person.id}
        planId={planId}
        teamId={teamId}
        positionId={positionId}
        currentStatus={getCurrentStatus(isConfirmed, isDeclined)}
        onSuccess={onScheduleSuccess}
        onError={onScheduleError}
      />
    ) : (
      <Button
        variant="outline"
        size="sm"
        className="w-full max-sm:size-10"
        aria-label={
          isScheduling
            ? `Adding ${person.fullName}`
            : `Add ${person.fullName} to this position`
        }
        disabled={!canSchedule || isScheduling}
        onClick={onSchedule}
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
    )}
  </div>
);

export interface ScheduleCandidateTileProps {
  person: PersonWithAvailability;
  serviceTypeId?: string | null;
  planId?: string | null;
  planReferenceDate?: Date | null;
  teamId?: string | null;
  positionId?: string | null;
  teamName?: string | null;
  positionName?: string | null;
  oneOff?: boolean;
  /** History or availability is still loading, so no score exists yet. */
  scorePending?: boolean;
  onScheduleSuccess?: () => void;
  onScheduleError?: (message: string) => void;
}

const ScheduleCandidateIdentityRow = ({
  fullName,
  isUnavailableForSlot,
  unavailableSlotLabel,
  isBlocked,
  serviceHistory,
  planReferenceDate,
}: {
  fullName: string;
  isUnavailableForSlot: boolean;
  unavailableSlotLabel: string | null;
  isBlocked: boolean;
  serviceHistory: PersonWithAvailability["serviceHistory"];
  planReferenceDate: Date | null;
}) => (
  <div className="flex min-w-0 flex-1 items-center gap-1">
    <p
      className={cn(
        "text-foreground min-w-0 truncate text-sm leading-tight font-medium sm:text-base",
        isUnavailableForSlot && "text-muted-foreground line-through"
      )}
    >
      {fullName}
    </p>
    {unavailableSlotLabel === null ? null : (
      <span
        className={cn(
          "shrink-0 text-xs font-semibold tracking-wide uppercase",
          isBlocked
            ? "text-status-scheduled dark:text-status-scheduled"
            : "text-status-declined dark:text-status-declined"
        )}
      >
        {unavailableSlotLabel}
      </span>
    )}
    <ScheduleContextPopover
      serviceHistory={serviceHistory ?? []}
      referenceDate={planReferenceDate}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="-my-1 shrink-0 sm:my-0"
        aria-label="Schedule context"
      >
        <Info className="text-muted-foreground" />
      </Button>
    </ScheduleContextPopover>
  </div>
);

export const ScheduleCandidateTile = ({
  person,
  serviceTypeId,
  planId,
  planReferenceDate = null,
  teamId,
  positionId,
  teamName,
  positionName,
  oneOff = false,
  scorePending = false,
  onScheduleSuccess,
  onScheduleError,
}: ScheduleCandidateTileProps) => {
  const isConfirmed = person.isConfirmedForSelectedPlanPosition === true;
  const isDeclined = person.isDeclinedForSelectedPlanPosition === true;
  const isBlocked = person.isBlockedForDate === true;
  const fromServerScheduled =
    person.isScheduledForSelectedPlanPosition === true || isConfirmed;

  const missingSelection = [serviceTypeId, planId, teamId, positionId].some(
    (id) => !isNonEmptyString(id)
  );
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

  const statusVariant = getStatusVariant(
    isBlocked,
    isDeclined,
    isConfirmed,
    isScheduled
  );
  const statusMeta = STATUS_META[statusVariant];

  const isUnavailableForSlot = isBlocked || isDeclined;
  const unavailableSlotLabel = isUnavailableForSlot ? statusMeta.label : null;

  const recommendationPercentage =
    isBlocked || person.recommendationScore === undefined
      ? null
      : Math.round(person.recommendationScore);
  const disableReason = getDisableReason(
    missingSelection,
    isBlocked,
    isDeclined,
    isScheduled
  );

  const canSchedule = disableReason === undefined;

  const serviceHistory = person.serviceHistory ?? [];
  const slotStatus = getSlotStatus(isScheduled, isConfirmed, isDeclined);

  return (
    <article
      className={cn(
        "group/row relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 px-3 py-2.5 sm:flex sm:gap-4 sm:py-3",
        "hover:bg-muted/30"
      )}
    >
      <ScheduleCandidateAvatar
        person={person}
        statusLabel={statusMeta.label}
        slotStatus={slotStatus}
        isBlocked={isBlocked}
        isDeclined={isDeclined}
        isScheduledElsewhereOnPlan={isScheduledElsewhereOnPlan}
        selectedPlanAssignments={selectedPlanAssignments}
      />

      <ScheduleCandidateIdentityRow
        fullName={person.fullName}
        isUnavailableForSlot={isUnavailableForSlot}
        unavailableSlotLabel={unavailableSlotLabel}
        isBlocked={isBlocked}
        serviceHistory={serviceHistory}
        planReferenceDate={planReferenceDate}
      />

      <div className="col-span-2 col-start-2 row-start-2 min-w-0 sm:col-auto sm:row-auto sm:block sm:w-28 sm:shrink-0">
        <ScheduleCandidateScore
          person={person}
          percentage={recommendationPercentage}
          pending={scorePending && !isBlocked}
        />
      </div>

      <ScheduleCandidateAction
        person={person}
        serviceTypeId={serviceTypeId}
        planId={planId}
        teamId={teamId}
        positionId={positionId}
        isScheduled={isScheduled}
        isConfirmed={isConfirmed}
        isDeclined={isDeclined}
        isScheduling={isScheduling}
        canSchedule={canSchedule}
        disableReason={disableReason}
        onSchedule={() => {
          handleSchedule(person);
        }}
        onScheduleSuccess={onScheduleSuccess}
        onScheduleError={onScheduleError}
      />

      {scheduleError !== null && scheduleError !== "" ? (
        <p className="text-destructive col-span-2 col-start-2 text-xs sm:absolute sm:-bottom-1 sm:left-14">
          {scheduleError}
        </p>
      ) : null}
    </article>
  );
};
