import {
  formatCalendarDateLabel,
  orgCalendarDaysRefMinusItem,
} from "@pcobooster/planning-center-models/calendar";
import { formatCalendarDayInTimeZone } from "@pcobooster/planning-center-models/calendar-day";
import { isDeclinedAssignmentStatus } from "@pcobooster/planning-center-models/candidate-frequency";
import type { ServiceHistoryItem } from "@pcobooster/planning-center-models/types";

/**
 * What a person told Planning Center about how often and when they want to serve. Everything
 * comes from the position's `PersonTeamPositionAssignment` rows and their included Services
 * `Person`, which the candidate list already reads, so honoring them costs no extra requests.
 */
export interface SchedulingPreferences {
  /** The assignment's `schedule_preference`, such as "Every other week" or "Once a month". */
  schedulePreference: string | null;
  /** Weeks of the month (1 to 5) the person picked; only set for "Choose Weeks". */
  preferredWeeks: number[];
  /** Service times (time preference option IDs) the person can serve; empty means any. */
  timePreferenceOptionIds: string[];
  /** Services `Person.preferred_max_plans_per_day`. */
  maxPlansPerDay: number | null;
  /** Services `Person.preferred_max_plans_per_month`. */
  maxPlansPerMonth: number | null;
}

export interface SchedulingPreferenceContext {
  /** The selected plan's sort instant. */
  referenceDate: Date;
  orgTimeZone: string;
  /** The selected plan, left out of "other plans" counts. */
  planId?: string;
  /** The service time the selected slot is needed for, when Planning Center says. */
  slotTimePreferenceOptionId?: string | null;
}

export interface SchedulingPreferenceScore {
  penalty: number;
  reasoning: string[];
}

/** Planning Center's own "Unavailable" setting for a position (not in its API docs). */
const UNAVAILABLE_PENALTY = 100;
const PREFERENCE_CONFLICT_PENALTY = 25;
const MAX_PLANS_REACHED_PENALTY = 30;
const TIME_PREFERENCE_PENALTY = 20;

const DAYS_PER_WEEK = 7;
const EVERY_NTH_WEEK_PATTERN = /^Every (?<weeks>\d+)(?:st|nd|rd|th) week$/u;
const TIMES_PER_MONTH = new Map([
  ["Once a month", 1],
  ["Twice a month", 2],
  ["Three times a month", 3],
]);
const ORDINALS = ["", "", "other", "3rd", "4th", "5th", "6th"] as const;

type SchedulePreferenceRule =
  | { kind: "unavailable" }
  | { kind: "interval"; weeks: number; label: string }
  | { kind: "perMonth"; times: number; label: string }
  | { kind: "weeks"; weeks: number[] };

const parseSchedulePreference = (
  preference: string | null,
  preferredWeeks: readonly number[]
): SchedulePreferenceRule | null => {
  if (preference === null) {
    return null;
  }
  if (preference === "Unavailable") {
    return { kind: "unavailable" };
  }
  if (preference === "Choose Weeks") {
    return preferredWeeks.length > 0
      ? { kind: "weeks", weeks: [...preferredWeeks].toSorted((a, b) => a - b) }
      : null;
  }
  const times = TIMES_PER_MONTH.get(preference);
  if (times !== undefined) {
    return { kind: "perMonth", times, label: preference.toLowerCase() };
  }
  if (preference === "Every other week") {
    return { kind: "interval", weeks: 2, label: "every other week" };
  }
  const weeks = Number(EVERY_NTH_WEEK_PATTERN.exec(preference)?.groups?.weeks);
  if (Number.isInteger(weeks) && weeks >= 2) {
    const ordinal = ORDINALS[weeks] ?? `${weeks}th`;
    return { kind: "interval", weeks, label: `every ${ordinal} week` };
  }
  // "Every week" and "As often as needed" ask nothing of the ranking.
  return null;
};

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const listWeeks = (weeks: readonly number[]) => {
  const labels = weeks.map(String);
  if (labels.length <= 1) {
    return labels.join("");
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
};

/** Planning Center counts weeks of the month from the 1st: days 1 to 7 are week 1. */
const weekOfMonth = (dayKey: string) =>
  Math.ceil(Number(dayKey.slice(8, 10)) / DAYS_PER_WEEK);

interface PlanHistoryView {
  planDay: string;
  planMonth: string;
  monthLabel: string;
  /** Distinct service days other than the plan's day. */
  otherServiceDays: string[];
  /** Other plans, by calendar day. */
  otherPlansByDay: Map<string, Set<string>>;
}

const isServiceItem = (item: ServiceHistoryItem) =>
  item.timeType === undefined || item.timeType === "service";

const viewHistory = (
  history: readonly ServiceHistoryItem[],
  { referenceDate, orgTimeZone, planId }: SchedulingPreferenceContext
): PlanHistoryView => {
  const planDay = formatCalendarDayInTimeZone(referenceDate, orgTimeZone);
  const serviceDays = new Set<string>();
  const otherPlansByDay = new Map<string, Set<string>>();
  for (const item of history) {
    if (isDeclinedAssignmentStatus(item.status)) {
      continue;
    }
    const day = formatCalendarDayInTimeZone(item.date, orgTimeZone);
    if (isServiceItem(item) && day !== planDay) {
      serviceDays.add(day);
    }
    const itemPlan = item.planId ?? item.sourceScheduleId;
    if (planId === undefined || itemPlan !== planId) {
      const plans = otherPlansByDay.get(day) ?? new Set<string>();
      plans.add(itemPlan);
      otherPlansByDay.set(day, plans);
    }
  }
  return {
    planDay,
    planMonth: planDay.slice(0, 7),
    monthLabel: formatCalendarDateLabel(
      referenceDate,
      orgTimeZone,
      "monthYear"
    ),
    otherServiceDays: [...serviceDays].toSorted(),
    otherPlansByDay,
  };
};

const scoreInterval = (
  rule: Extract<SchedulePreferenceRule, { kind: "interval" }>,
  view: PlanHistoryView,
  reasoning: string[]
): number => {
  const gapDays = rule.weeks * DAYS_PER_WEEK;
  let daysBefore = Number.POSITIVE_INFINITY;
  let daysAfter = Number.POSITIVE_INFINITY;
  for (const day of view.otherServiceDays) {
    const offset = orgCalendarDaysRefMinusItem(day, view.planDay);
    if (offset > 0) {
      daysBefore = Math.min(daysBefore, offset);
    } else {
      daysAfter = Math.min(daysAfter, -offset);
    }
  }
  const conflicts: string[] = [];
  if (daysBefore < gapDays) {
    conflicts.push(`Ranked lower: served ${plural(daysBefore, "day")} before`);
  }
  if (daysAfter < gapDays) {
    conflicts.push(`Ranked lower: serving ${plural(daysAfter, "day")} after`);
  }
  if (conflicts.length === 0) {
    reasoning.push(`Prefers to serve ${rule.label}; this plan fits`);
    return 0;
  }
  reasoning.push(`Prefers to serve ${rule.label}`, ...conflicts);
  return PREFERENCE_CONFLICT_PENALTY;
};

const scorePerMonth = (
  rule: Extract<SchedulePreferenceRule, { kind: "perMonth" }>,
  view: PlanHistoryView,
  reasoning: string[]
): number => {
  const daysThisMonth = view.otherServiceDays.filter((day) =>
    day.startsWith(view.planMonth)
  ).length;
  if (daysThisMonth < rule.times) {
    reasoning.push(`Prefers to serve ${rule.label}; this plan fits`);
    return 0;
  }
  reasoning.push(
    `Prefers to serve ${rule.label}`,
    `Ranked lower: already serving ${plural(daysThisMonth, "other day")} in ${view.monthLabel}`
  );
  return PREFERENCE_CONFLICT_PENALTY;
};

const scoreWeeks = (
  rule: Extract<SchedulePreferenceRule, { kind: "weeks" }>,
  view: PlanHistoryView,
  reasoning: string[]
): number => {
  const week = weekOfMonth(view.planDay);
  const preferred = `Prefers week${rule.weeks.length === 1 ? "" : "s"} ${listWeeks(rule.weeks)} of the month`;
  if (rule.weeks.includes(week)) {
    reasoning.push(`${preferred}; this plan is in week ${week}`);
    return 0;
  }
  reasoning.push(preferred, `Ranked lower: this plan is in week ${week}`);
  return PREFERENCE_CONFLICT_PENALTY;
};

const scoreSchedulePreference = (
  rule: SchedulePreferenceRule,
  view: PlanHistoryView,
  reasoning: string[]
): number => {
  switch (rule.kind) {
    case "unavailable": {
      reasoning.push(
        "Marked Unavailable for this position in Planning Center",
        "Ranked lower: asked not to be scheduled here"
      );
      return UNAVAILABLE_PENALTY;
    }
    case "interval": {
      return scoreInterval(rule, view, reasoning);
    }
    case "perMonth": {
      return scorePerMonth(rule, view, reasoning);
    }
    case "weeks": {
      return scoreWeeks(rule, view, reasoning);
    }
    default: {
      return 0;
    }
  }
};

const scoreMaxPlansPerMonth = (
  max: number,
  view: PlanHistoryView,
  reasoning: string[]
): number => {
  const plans = new Set<string>();
  for (const [day, dayPlans] of view.otherPlansByDay) {
    if (day.startsWith(view.planMonth)) {
      for (const plan of dayPlans) {
        plans.add(plan);
      }
    }
  }
  const limit = `At most ${plural(max, "plan")} a month`;
  if (plans.size < max) {
    reasoning.push(`${limit}; this plan fits`);
    return 0;
  }
  reasoning.push(
    limit,
    `Ranked lower: already on ${plural(plans.size, "other plan")} in ${view.monthLabel}`
  );
  return MAX_PLANS_REACHED_PENALTY;
};

/** Only a reached daily limit is worth a line; most people never get close. */
const scoreMaxPlansPerDay = (
  max: number,
  view: PlanHistoryView,
  reasoning: string[]
): number => {
  const plansThatDay = view.otherPlansByDay.get(view.planDay)?.size ?? 0;
  if (plansThatDay < max) {
    return 0;
  }
  reasoning.push(
    `At most ${plural(max, "plan")} a day`,
    `Ranked lower: already on ${plural(plansThatDay, "other plan")} that day`
  );
  return MAX_PLANS_REACHED_PENALTY;
};

const scoreTimePreference = (
  optionIds: readonly string[],
  slotOptionId: string | null | undefined,
  reasoning: string[]
): number => {
  if (
    slotOptionId === null ||
    slotOptionId === undefined ||
    optionIds.length === 0 ||
    optionIds.includes(slotOptionId)
  ) {
    return 0;
  }
  reasoning.push(
    "Prefers other service times",
    "Ranked lower: not this slot's service time"
  );
  return TIME_PREFERENCE_PENALTY;
};

/**
 * Scores a candidate against their Planning Center scheduling preferences, using the history the
 * candidate list already loaded (a few weeks either side of the plan). Returns how much to lower
 * the raw score and the lines that explain it: a preference line, then any "Ranked lower" lines.
 */
export const scoreSchedulingPreferences = (
  preferences: SchedulingPreferences,
  history: readonly ServiceHistoryItem[],
  context: SchedulingPreferenceContext
): SchedulingPreferenceScore => {
  const reasoning: string[] = [];
  const view = viewHistory(history, context);
  let penalty = 0;
  const rule = parseSchedulePreference(
    preferences.schedulePreference,
    preferences.preferredWeeks
  );
  if (rule !== null) {
    penalty += scoreSchedulePreference(rule, view, reasoning);
  }
  if (
    preferences.maxPlansPerMonth !== null &&
    preferences.maxPlansPerMonth > 0
  ) {
    penalty += scoreMaxPlansPerMonth(
      preferences.maxPlansPerMonth,
      view,
      reasoning
    );
  }
  if (preferences.maxPlansPerDay !== null && preferences.maxPlansPerDay > 0) {
    penalty += scoreMaxPlansPerDay(preferences.maxPlansPerDay, view, reasoning);
  }
  penalty += scoreTimePreference(
    preferences.timePreferenceOptionIds,
    context.slotTimePreferenceOptionId,
    reasoning
  );
  return { penalty, reasoning };
};
