"use client";

import { format } from "date-fns";
import { ChevronDownIcon, Clock3, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  formatCalendarDay,
  formatPlanTimeRangeLabel,
  parseCalendarDay,
} from "@/components/schedule/plan-time-display";
import { TimeAssignmentSelector } from "@/components/time-assignment-selector";
import type { TimeAssignmentValue } from "@/components/time-assignment-selector";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePersistOnClosePopover } from "@/hooks/use-persist-on-close-popover";
import type { PlanTimeType, TeamPositionGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PlanTimeEditState {
  name: string;
  timeType: PlanTimeType;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  assignedTeamIds: string[];
  assignedPositionIds: string[];
  assignedNeededPositionIds: string[];
  assignedPlanPersonIds: string[];
}

interface PlanTimeCardProps {
  planTimeId: string;
  edit: PlanTimeEditState;
  valid: boolean;
  saving: boolean;
  assignmentGroups: TeamPositionGroup[];
  assignmentsLoading: boolean;
  deleting: boolean;
  onEditChange: (patch: Partial<PlanTimeEditState>) => void;
  onCommitEdit: (patch: Partial<PlanTimeEditState>) => void;
  onPersist: () => void;
  onDelete: () => Promise<void>;
}

const timeTypeLabels: Record<PlanTimeType, string> = {
  service: "Service",
  rehearsal: "Rehearsal",
  other: "Other",
};

interface PlanTimeRangeEditorProps {
  id: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  invalid?: boolean;
  onEditChange: (patch: {
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
  }) => void;
  onCommitEdit: (patch: {
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
  }) => void;
  onPersist: () => void;
}

interface DatePickerFieldProps {
  id: string;
  label: string;
  value: string;
  invalid?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (dateKey: string) => void;
}

const DatePickerField = ({
  id,
  label,
  value,
  invalid = false,
  open,
  onOpenChange,
  onChange,
}: DatePickerFieldProps) => {
  const selectedDate = parseCalendarDay(value);

  return (
    <Field density="tight">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            weight="normal"
            className="w-full justify-between"
            aria-invalid={invalid || undefined}
          >
            <span className="truncate">
              {selectedDate
                ? format(selectedDate, "MMM d, yyyy")
                : "Select date"}
            </span>
            <ChevronDownIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          density="flush"
          className="w-auto overflow-hidden"
          align="start"
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            captionLayout="dropdown"
            defaultMonth={selectedDate}
            onSelect={(date) => {
              if (!date) {
                return;
              }
              onChange(formatCalendarDay(date));
              onOpenChange(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
};

interface TimePickerFieldProps {
  id: string;
  label: string;
  value: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}

const TimePickerField = ({
  id,
  label,
  value,
  invalid = false,
  onChange,
}: TimePickerFieldProps) => (
  <Field density="tight" className="min-w-0 flex-1">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input
      type="time"
      id={id}
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  </Field>
);

const PlanTimeRangeEditor = ({
  id,
  startDate,
  startTime,
  endDate,
  endTime,
  invalid = false,
  onEditChange,
  onCommitEdit,
  onPersist,
}: PlanTimeRangeEditorProps) => {
  const [dateOpen, setDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const sameDay = !endDate || endDate === startDate;
  const displayLabel = formatPlanTimeRangeLabel({
    startDate,
    startTime,
    endDate,
    endTime,
  });
  const nestedPickerOpen = dateOpen || endDateOpen;

  const { open, handleOpenChange, contentRef } = usePersistOnClosePopover({
    onClose: () => {
      onPersist();
      setDateOpen(false);
      setEndDateOpen(false);
    },
    enterToClose: { disabled: nestedPickerOpen },
  });

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost-muted"
          size="sm"
          className="group/time-range w-full justify-start"
          data-invalid={invalid || undefined}
          aria-label={`Edit time, ${displayLabel}`}
          aria-expanded={open}
        >
          <Clock3 className="size-3.5 shrink-0" />
          <span
            className={cn(
              "min-w-0 flex-1 text-left",
              invalid && "text-destructive"
            )}
          >
            {displayLabel}
          </span>
          <Pencil
            className={cn(
              "size-3.5 shrink-0 transition-opacity",
              open
                ? "opacity-60"
                : "opacity-0 group-hover/time-range:opacity-60"
            )}
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        ref={contentRef}
        align="start"
        className="w-80"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <FieldGroup density="compact" data-invalid={invalid || undefined}>
          <DatePickerField
            id={`${id}-date`}
            label="Date"
            value={startDate}
            invalid={invalid}
            open={dateOpen}
            onOpenChange={setDateOpen}
            onChange={(dateKey) => {
              onCommitEdit({
                startDate: dateKey,
                endDate: endDate || dateKey,
              });
            }}
          />

          <div className="flex gap-3">
            <TimePickerField
              id={`${id}-start-time`}
              label="Start"
              value={startTime}
              invalid={invalid}
              onChange={(nextStartTime) => {
                onEditChange({ startTime: nextStartTime });
              }}
            />
            <TimePickerField
              id={`${id}-end-time`}
              label="End"
              value={endTime}
              invalid={invalid}
              onChange={(nextEndTime) => {
                onEditChange({ endTime: nextEndTime });
              }}
            />
          </div>

          {sameDay ? null : (
            <DatePickerField
              id={`${id}-end-date`}
              label="End date"
              value={endDate || startDate}
              invalid={invalid}
              open={endDateOpen}
              onOpenChange={setEndDateOpen}
              onChange={(dateKey) => {
                onCommitEdit({ endDate: dateKey });
              }}
            />
          )}
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
};

export const PlanTimeCard = ({
  planTimeId,
  edit,
  valid,
  saving,
  assignmentGroups,
  assignmentsLoading,
  deleting,
  onEditChange,
  onCommitEdit,
  onPersist,
  onDelete,
}: PlanTimeCardProps) => {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const assignmentValue: TimeAssignmentValue = {
    teamIds: edit.assignedTeamIds,
    positionIds: edit.assignedPositionIds,
    neededPositionIds: edit.assignedNeededPositionIds,
    planPersonIds: edit.assignedPlanPersonIds,
  };

  return (
    <Card density="compact" aria-busy={saving} className="group/plan-time">
      <CardContent density="compact" layout="stack" className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`plan-time-name-${planTimeId}`}
            value={edit.name}
            placeholder="Untitled time"
            aria-label="Time name"
            className="min-w-0 flex-1"
            onChange={(event) => {
              onEditChange({ name: event.target.value });
            }}
            onBlur={(event) => {
              onCommitEdit({ name: event.target.value });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <NativeSelect
            id={`plan-time-type-${planTimeId}`}
            size="sm"
            value={edit.timeType}
            aria-label="Time type"
            onChange={(event) => {
              const timeType = event.target.value;
              if (
                timeType === "service" ||
                timeType === "rehearsal" ||
                timeType === "other"
              ) {
                onCommitEdit({ timeType });
              }
            }}
          >
            <NativeSelectOption value="rehearsal">
              {timeTypeLabels.rehearsal}
            </NativeSelectOption>
            <NativeSelectOption value="service">
              {timeTypeLabels.service}
            </NativeSelectOption>
            <NativeSelectOption value="other">
              {timeTypeLabels.other}
            </NativeSelectOption>
          </NativeSelect>
          <Button
            type="button"
            variant="ghost-destructive"
            size="icon-xs"
            className="shrink-0"
            aria-label={`Delete ${edit.name || "time"}`}
            disabled={saving || deleting}
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <PlanTimeRangeEditor
          id={`plan-time-range-${planTimeId}`}
          startDate={edit.startDate}
          startTime={edit.startTime}
          endDate={edit.endDate}
          endTime={edit.endTime}
          invalid={!valid}
          onEditChange={onEditChange}
          onCommitEdit={onCommitEdit}
          onPersist={onPersist}
        />

        <TimeAssignmentSelector
          groups={assignmentGroups}
          value={assignmentValue}
          disabled={assignmentsLoading}
          onChange={(assignment) => {
            onCommitEdit({
              assignedTeamIds: assignment.teamIds,
              assignedPositionIds: assignment.positionIds,
              assignedNeededPositionIds: assignment.neededPositionIds,
              assignedPlanPersonIds: assignment.planPersonIds,
            });
          }}
        />
      </CardContent>
      <DeleteConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={async () => {
          await onDelete();
          setDeleteOpen(false);
        }}
        isPending={deleting}
        itemLabel={edit.name || "this time"}
        title="Delete time?"
        description="Remove this time from the plan? Any assignments tied to it will also lose this time."
        confirmLabel="Delete time"
      />
    </Card>
  );
};
