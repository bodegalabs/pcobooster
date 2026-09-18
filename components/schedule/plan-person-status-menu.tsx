"use client";

import { Check, Loader2, Trash2 } from "lucide-react";

import {
  getPlanPersonStatusMeta,
  STATUS_ITEMS,
  STATUS_TO_CODE,
} from "@/components/schedule/plan-person-status";
import type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status";
import { ScheduleStatusDot } from "@/components/schedule/status-dot";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUnschedulePlanPerson } from "@/hooks/use-unschedule-plan-person";
import { useUpdatePlanPersonStatus } from "@/hooks/use-update-plan-person-status";

export type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status";

export interface PlanPersonStatusMenuProps {
  planPersonId: string | null | undefined;
  currentStatus: PlanPersonStatusValue;
  serviceTypeId?: string | null;
  personId?: string | null;
  planId?: string | null;
  teamId?: string | null;
  positionId?: string | null;
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

export const PlanPersonStatusMenu = ({
  planPersonId,
  currentStatus,
  serviceTypeId,
  personId,
  planId,
  teamId,
  positionId,
  onSuccess,
  onError,
}: PlanPersonStatusMenuProps) => {
  const { isUpdating, handleUpdate } = useUpdatePlanPersonStatus({
    onSuccess,
    onError,
  });
  const { isUnscheduling, handleUnschedule } = useUnschedulePlanPerson({
    onSuccess,
    onError,
  });
  const isBusy = isUpdating || isUnscheduling;
  const currentItem = getPlanPersonStatusMeta(currentStatus);
  const hasPlanPersonId =
    planPersonId !== null && planPersonId !== undefined && planPersonId !== "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 justify-self-center"
            aria-label={`Change status — ${currentItem.label}`}
            title={currentItem.label}
            disabled={!hasPlanPersonId || isBusy}
          />
        }
      >
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ScheduleStatusDot status={currentItem.status} aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {STATUS_ITEMS.map(({ value, label, status }) => (
          <DropdownMenuItem
            key={value}
            disabled={currentStatus === value}
            onSelect={() => {
              handleUpdate(planPersonId, STATUS_TO_CODE[value], {
                serviceTypeId,
                personId,
                planId,
                teamId,
                positionId,
              });
            }}
          >
            <ScheduleStatusDot status={status} aria-hidden />
            <span className="flex-1">{label}</span>
            {currentStatus === value ? (
              <Check className="size-3.5 opacity-70" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator inset />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            handleUnschedule(planPersonId, {
              serviceTypeId,
              personId,
              planId,
              teamId,
              positionId,
            });
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
          <span className="flex-1">Unschedule</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
