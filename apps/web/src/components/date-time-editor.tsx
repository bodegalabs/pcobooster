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
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";

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

const parseCalendarDay = (value: string): Date | undefined => {
  const matchesDatePattern = /^\d{4}-\d{2}-\d{2}$/u.test(value);
  if (!matchesDatePattern) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  const monthIndex = month - 1;

  const date = new Date(year, monthIndex, day);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatCalendarDay = (date: Date): string => format(date, "yyyy-MM-dd");

export const DateTimeEditor = ({
  id,
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  invalid = false,
  disabled = false,
  className,
}: DateTimeEditorProps) => {
  const selectedDate = parseCalendarDay(dateValue);

  return (
    <Field className={className} data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={`${id}-time`}>{label}</FieldLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
        <ResponsivePopover>
          <ResponsivePopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="justify-start text-left"
                aria-invalid={invalid || undefined}
                disabled={disabled}
              />
            }
          >
            <CalendarIcon data-icon="inline-start" />
            <span className="truncate">
              {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Pick date"}
            </span>
          </ResponsivePopoverTrigger>
          <ResponsivePopoverContent
            title="Pick a date"
            className="w-auto"
            align="start"
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  onDateChange(formatCalendarDay(date));
                }
              }}
              disabled={disabled}
              autoFocus
            />
          </ResponsivePopoverContent>
        </ResponsivePopover>

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
            onChange={(event) => {
              onTimeChange(event.target.value);
            }}
          />
        </InputGroup>
      </div>
    </Field>
  );
};
