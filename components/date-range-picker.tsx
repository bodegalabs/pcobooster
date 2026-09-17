"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
}

export const DateRangePicker = ({
  date,
  onDateChange,
}: DateRangePickerProps) => (
  <Popover>
    <PopoverTrigger
      render={<Button variant="outline" className="justify-start text-left" />}
    >
      <CalendarIcon className="mr-2 h-4 w-4" />
      {format(date, "PPP")}
    </PopoverTrigger>
    <PopoverContent className="w-auto" align="start">
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
    </PopoverContent>
  </Popover>
);
