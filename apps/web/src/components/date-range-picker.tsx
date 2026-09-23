"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from "@/components/ui/responsive-popover";

interface DateRangePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
}

export const DateRangePicker = ({
  date,
  onDateChange,
}: DateRangePickerProps) => (
  <ResponsivePopover>
    <ResponsivePopoverTrigger
      render={<Button variant="outline" className="justify-start text-left" />}
    >
      <CalendarIcon className="mr-2 h-4 w-4" />
      {format(date, "PPP")}
    </ResponsivePopoverTrigger>
    <ResponsivePopoverContent
      title="Date range"
      className="w-auto"
      align="start"
    >
      <Calendar
        mode="single"
        selected={date}
        onSelect={(newDate) => {
          if (newDate !== undefined) {
            onDateChange(newDate);
          }
        }}
        autoFocus
      />
    </ResponsivePopoverContent>
  </ResponsivePopover>
);
