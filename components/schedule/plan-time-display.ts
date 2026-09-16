import { format } from "date-fns";

export const parseCalendarDay = (value: string): Date | undefined => {
  const matchesDatePattern = /^\d{4}-\d{2}-\d{2}$/u.test(value);
  if (!matchesDatePattern) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  const monthIndex = month - 1;

  const date = new Date(year, monthIndex, day);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const formatCalendarDay = (date: Date): string =>
  format(date, "yyyy-MM-dd");

const formatTime12 = (timeValue: string): string => {
  const [hour, minute] = timeValue.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return timeValue;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
};

export const formatPlanTimeRangeLabel = (edit: {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}): string => {
  if (!edit.startDate || !edit.startTime) {
    return "Set start time";
  }

  const startDate = parseCalendarDay(edit.startDate);
  const startTimeLabel = formatTime12(edit.startTime);

  if (!edit.endTime) {
    return startDate
      ? `${format(startDate, "EEE, MMM d")} · ${startTimeLabel}`
      : startTimeLabel;
  }

  const endTimeLabel = formatTime12(edit.endTime);
  const sameDay = !edit.endDate || edit.endDate === edit.startDate;

  if (sameDay && startDate) {
    return `${format(startDate, "EEE, MMM d")} · ${startTimeLabel} – ${endTimeLabel}`;
  }

  const endDate = parseCalendarDay(edit.endDate || edit.startDate);
  if (startDate && endDate) {
    return `${format(startDate, "EEE, MMM d")} ${startTimeLabel} – ${format(endDate, "EEE, MMM d")} ${endTimeLabel}`;
  }

  return `${startTimeLabel} – ${endTimeLabel}`;
};
