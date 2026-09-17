"use client";

import { Check, Loader2, MoreVertical, Trash2 } from "lucide-react";

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
import type { PlanPersonStatusCode } from "@/hooks/use-update-plan-person-status";
import { cn } from "@/lib/utils";

export type PlanPersonStatusValue = "confirmed" | "scheduled" | "declined";

const STATUS_TO_CODE: Record<PlanPersonStatusValue, PlanPersonStatusCode> = {
  confirmed: "C",
  scheduled: "U",
  declined: "D",
};

const ITEMS: {
  value: PlanPersonStatusValue;
  label: string;
  dotClassName: string;
}[] = [
  { value: "confirmed", label: "Confirmed", dotClassName: "bg-emerald-500" },
  { value: "scheduled", label: "Pending", dotClassName: "bg-amber-500" },
  { value: "declined", label: "Declined", dotClassName: "bg-red-500" },
];

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto size-8"
            aria-label="Change status"
            disabled={
              !(
                planPersonId !== null &&
                planPersonId !== undefined &&
                planPersonId !== ""
              ) || isBusy
            }
          />
        }
      >
        {isBusy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MoreVertical className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {ITEMS.map(({ value, label, dotClassName }) => (
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
            <span
              className={cn("size-1.5 shrink-0 rounded-full", dotClassName)}
              aria-hidden
            />
            <span className="flex-1">{label}</span>
            {currentStatus === value ? (
              <Check className="size-3.5 opacity-70" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
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
