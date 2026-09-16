"use client";

import { format } from "date-fns";
import { CalendarIcon, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateTimeEditorProps {
  id: string;
  label: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (dateValue: string) => void;
  onTimeChange: (timeValue: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

export function DateTimeEditor({
  id,
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  invalid = false,
  disabled = false,
  className,
}: DateTimeEditorProps) {
  const selectedDate = parseCalendarDay(dateValue);

  return (
    <Field
      className={cn("gap-1.5", className)}
      data-invalid={invalid || undefined}
    >
      <FieldLabel htmlFor={`${id}-time`}>{label}</FieldLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "justify-start px-3 text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
              aria-invalid={invalid || undefined}
              disabled={disabled}
            >
              <CalendarIcon data-icon="inline-start" />
              <span className="truncate">
                {selectedDate
                  ? format(selectedDate, "MMM d, yyyy")
                  : "Pick date"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) onDateChange(formatCalendarDay(date));
              }}
              disabled={disabled}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <InputGroup>
          <InputGroupAddon>
            <Clock3 />
          </InputGroupAddon>
          <InputGroupInput
            id={`${id}-time`}
            type="time"
            value={timeValue}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            onChange={(event) => onTimeChange(event.target.value)}
          />
        </InputGroup>
      </div>
    </Field>
  );
}

function parseCalendarDay(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatCalendarDay(date: Date): string {
  return format(date, "yyyy-MM-dd");
}
