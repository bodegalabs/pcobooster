import { formatCalendarDateLabel } from "@pcobooster/planning-center-models/calendar";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar-day";
import type { ScheduleFrequency } from "@pcobooster/planning-center-models/types";

const dateLabel = (
  date: Date | undefined,
  orgTimeZone: string
): string | null =>
  date === undefined
    ? null
    : formatCalendarDateLabel(date, orgTimeZone, "monthDay");

/**
 * The few schedule facts a leader weighs before adding someone, as short phrases for one
 * line under their name: when they last served before this plan and when they serve next
 * after it (the schedule strip beside it shows how busy those weeks are). Dates are congregation calendar days; a
 * service on the plan's own day is "serving that day", not their last time.
 */
export const summarizeCandidateSchedule = (
  frequency: ScheduleFrequency | undefined,
  referenceDate: Date | null,
  orgTimeZone: string,
  { onThisPlan = false }: { onThisPlan?: boolean } = {}
): string[] => {
  if (frequency === undefined) {
    return [];
  }
  const facts: string[] = [];
  const { lastServedDate } = frequency;
  const servesThatDay =
    lastServedDate !== undefined &&
    referenceDate !== null &&
    formatCalendarDayInTimeZone(lastServedDate, orgTimeZone) ===
      formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const lastServed = dateLabel(lastServedDate, orgTimeZone);
  if (servesThatDay) {
    // Being on this plan already says so.
    if (!onThisPlan) {
      facts.push("Serving that day");
    }
  } else {
    facts.push(
      lastServed === null ? "No recent services" : `Last served ${lastServed}`
    );
  }
  const next = dateLabel(frequency.nextUpcomingDate, orgTimeZone);
  if (next !== null) {
    facts.push(`Next on ${next}`);
  }
  return facts;
};
