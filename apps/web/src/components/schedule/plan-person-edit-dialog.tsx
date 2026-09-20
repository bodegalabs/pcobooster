"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { startTransition, useState } from "react";
import { toast } from "sonner";

import {
  getPlanPersonStatusValue,
  STATUS_ITEMS,
  STATUS_TO_CODE,
} from "@/components/schedule/plan-person-status";
import type { PlanPersonStatusValue } from "@/components/schedule/plan-person-status";
import { formatPlanTimeRangeLabel } from "@/components/schedule/plan-time-display";
import { ScheduleStatusDot } from "@/components/schedule/status-dot";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SelectionPickerCheckbox,
  SelectionPickerOption,
  SelectionPickerShell,
} from "@/components/ui/selection-picker";
import { selectionPickerSectionTitleClass } from "@/components/ui/selection-picker-styles";
import { useOrganizationTimeZone } from "@/hooks/use-organization-timezone";
import type { ScheduleMutationInvalidateContext } from "@/hooks/use-schedule-cache-optimism";
import { useUnschedulePlanPerson } from "@/hooks/use-unschedule-plan-person";
import { useUpdatePlanPersonStatus } from "@/hooks/use-update-plan-person-status";
import { getInitials } from "@/lib/format/initials";
import { formatWallTimeInTimeZone } from "@/lib/planning-center/org-calendar";
import { queryKeys } from "@/lib/query-keys";
import type { FilledPositionPerson, PlanTime } from "@/lib/types";
import { orpc } from "@/orpc-client";

interface PlanPersonEditDialogProps {
  person: FilledPositionPerson;
  teamName: string;
  positionName: string;
  planTimes: PlanTime[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceTypeId: string | null;
  planId: string | null;
  seriesId: string | null;
  teamId: string;
  positionId: string;
}

const formatPlanTimeScheduleLabel = (
  planTime: PlanTime,
  timeZone: string
): string => {
  const starts = formatWallTimeInTimeZone(planTime.startsAt, timeZone);
  const ends = planTime.endsAt
    ? formatWallTimeInTimeZone(planTime.endsAt, timeZone)
    : null;

  return formatPlanTimeRangeLabel({
    startDate: starts.dateKey,
    startTime: starts.timeValue,
    endDate: ends?.dateKey ?? starts.dateKey,
    endTime: ends?.timeValue ?? "",
  });
};

const haveSameIds = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  const aSet = new Set(a);
  return b.every((id) => aSet.has(id));
};

const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

const PlanPersonStatusPicker = ({
  value,
  disabled,
  onChange,
}: {
  value: PlanPersonStatusValue;
  disabled: boolean;
  onChange: (value: PlanPersonStatusValue) => void;
}) => (
  <section className="flex flex-col gap-2.5">
    <h3 className={selectionPickerSectionTitleClass}>Confirmation status</h3>
    <SelectionPickerShell layout="segment">
      {STATUS_ITEMS.map(({ value: itemValue, label, status }) => {
        const selected = value === itemValue;

        return (
          <SelectionPickerOption
            key={itemValue}
            selected={selected}
            layout="segment"
            disabled={disabled}
            onClick={() => {
              onChange(itemValue);
            }}
          >
            <ScheduleStatusDot status={status} aria-hidden />
            <span className="truncate">{label}</span>
          </SelectionPickerOption>
        );
      })}
    </SelectionPickerShell>
  </section>
);

const PlanPersonTimesPicker = ({
  planTimes,
  selectedTimeIds,
  canEdit,
  disabled,
  timeZone,
  onToggle,
}: {
  planTimes: PlanTime[];
  selectedTimeIds: string[];
  canEdit: boolean;
  disabled: boolean;
  timeZone: string;
  onToggle: (planTimeId: string) => void;
}) => {
  const selectedTimeIdSet = new Set(selectedTimeIds);

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className={selectionPickerSectionTitleClass}>Plan times</h3>
      <SelectionPickerShell>
        {planTimes.map((planTime) => {
          const selected = selectedTimeIdSet.has(planTime.id);

          return (
            <SelectionPickerOption
              key={planTime.id}
              selected={selected}
              disabled={!canEdit || disabled}
              onClick={() => {
                onToggle(planTime.id);
              }}
            >
              <SelectionPickerCheckbox selected={selected} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {planTime.name}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {formatPlanTimeScheduleLabel(planTime, timeZone)}
                </span>
              </span>
            </SelectionPickerOption>
          );
        })}
      </SelectionPickerShell>
      {canEdit ? null : (
        <p className="text-muted-foreground text-xs">
          Plan times cannot be edited for this assignment.
        </p>
      )}
    </section>
  );
};

const PlanPersonEditDialogBody = ({
  person,
  teamName,
  positionName,
  planTimes,
  onOpenChange,
  serviceTypeId,
  planId,
  seriesId,
  teamId,
  positionId,
}: Omit<PlanPersonEditDialogProps, "open">) => {
  const queryClient = useQueryClient();
  const timeZone = useOrganizationTimeZone();
  const initialStatus = getPlanPersonStatusValue(person);
  const initialTimeIds = person.assignedTimeIds ?? [];
  const [draftStatus, setDraftStatus] =
    useState<PlanPersonStatusValue>(initialStatus);
  const [draftTimeIds, setDraftTimeIds] = useState(initialTimeIds);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const mutationContext: ScheduleMutationInvalidateContext & {
    personId?: string | null;
    teamId?: string | null;
    positionId?: string | null;
  } = {
    serviceTypeId,
    personId: person.id,
    planId,
    teamId,
    positionId,
  };

  const canEditTimes =
    serviceTypeId !== null &&
    serviceTypeId !== "" &&
    planId !== null &&
    planId !== "" &&
    person.personId !== null &&
    person.personId !== undefined &&
    person.personId !== "" &&
    planTimes.length > 0;

  const { updateStatusAsync, isUpdating } = useUpdatePlanPersonStatus({
    onError: (message) => {
      setSaveError(message);
    },
  });

  const { handleUnschedule, isUnscheduling } = useUnschedulePlanPerson({
    onSuccess: () => {
      onOpenChange(false);
    },
    onError: (message) => {
      toast.error(message);
    },
  });

  const isBusy = isSaving || isUpdating || isUnscheduling;
  const statusChanged = draftStatus !== initialStatus;
  const timesChanged = !haveSameIds(draftTimeIds, initialTimeIds);
  const hasChanges = statusChanged || timesChanged;

  const persistTimes = async (timeIds: string[]) => {
    const { personId } = person;
    if (!canEditTimes || personId === null || personId === undefined) {
      return;
    }

    await orpc.planPeople.updateTimes({
      planPersonId: person.planPersonId,
      serviceTypeId,
      planId,
      personId,
      planTimeIds: timeIds,
    });

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.teamPositions(serviceTypeId, planId, seriesId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.planTimes(serviceTypeId, planId),
      }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "people" && query.queryKey.includes(planId),
      }),
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "people-history-warmup" &&
          query.queryKey[1] === serviceTypeId,
      }),
    ]);
  };

  const handleSave = async () => {
    if (!hasChanges || isBusy) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      if (statusChanged) {
        await updateStatusAsync(
          person.planPersonId,
          STATUS_TO_CODE[draftStatus],
          mutationContext
        );
      }
      if (timesChanged) {
        await persistTimes(draftTimeIds);
      }
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save changes";
      setSaveError(message);
    }

    setIsSaving(false);
  };

  return (
    <DialogContent className="sm:max-w-md">
      <div className="flex flex-col gap-3">
        <DialogHeader>
          <div className="flex items-center gap-2.5 pr-8">
            <Avatar size="sm">
              <AvatarImage
                src={person.photoThumbnailUrl ?? undefined}
                alt={person.name}
              />
              <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle>{person.name}</DialogTitle>
              <DialogDescription>
                {teamName} · {positionName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <PlanPersonStatusPicker
            value={draftStatus}
            disabled={isBusy}
            onChange={setDraftStatus}
          />
          {planTimes.length > 0 ? (
            <div className="border-border border-t pt-4">
              <PlanPersonTimesPicker
                planTimes={planTimes}
                selectedTimeIds={draftTimeIds}
                canEdit={canEditTimes}
                disabled={isBusy}
                timeZone={timeZone}
                onToggle={(planTimeId) => {
                  setDraftTimeIds((current) => toggleId(current, planTimeId));
                }}
              />
            </div>
          ) : null}
        </div>

        {saveError !== null && saveError !== "" ? (
          <p className="text-destructive text-sm">{saveError}</p>
        ) : null}

        <div className="border-border flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              handleUnschedule(person.planPersonId, mutationContext);
            }}
          >
            {isUnscheduling ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            Unschedule
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isBusy || !hasChanges}
              onClick={() => {
                startTransition(handleSave);
              }}
            >
              {isSaving || isUpdating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </div>
        </div>
      </div>
    </DialogContent>
  );
};

export const PlanPersonEditDialog = ({
  open,
  onOpenChange,
  person,
  ...rest
}: PlanPersonEditDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {open ? (
      <PlanPersonEditDialogBody
        key={person.planPersonId}
        person={person}
        onOpenChange={onOpenChange}
        {...rest}
      />
    ) : null}
  </Dialog>
);
