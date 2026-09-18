import { orgCalendarDaysBetween } from "@/lib/planning-center/org-calendar";
import { formatPlanHistoryHalfRangeWeeksLabel } from "@/lib/planning-center/schedule-load-constants";
import type { PersonWithAvailability, ScheduleFrequency } from "@/lib/types";

const recommendationDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatDate = (date: Date): string =>
  recommendationDateFormatter.format(date);

const proximityPenalty = (
  nextDate: Date | undefined,
  referenceDate: Date,
  orgTimeZone: string,
  nearPenalty: number,
  laterPenalty: number
): number => {
  if (nextDate === undefined) {
    return 0;
  }
  const daysUntilNext = orgCalendarDaysBetween(
    referenceDate,
    nextDate,
    orgTimeZone
  );
  if (daysUntilNext <= 7) {
    return nearPenalty;
  }
  if (daysUntilNext <= 14) {
    return laterPenalty;
  }
  return 0;
};

const appendLastServiceReasoning = (
  frequency: ScheduleFrequency,
  daysSinceLastServed: number,
  reasoning: string[]
): void => {
  if (frequency.lastServedDate === undefined && frequency.totalServed === 0) {
    reasoning.push("No past services scheduled");
    return;
  }
  if (frequency.lastServedDate === undefined) {
    return;
  }
  const lastServedStr = formatDate(frequency.lastServedDate);
  if (daysSinceLastServed === 0) {
    reasoning.push(`Last served on the same date (${lastServedStr})`);
  } else if (daysSinceLastServed === 1) {
    reasoning.push(`Last served 1 day before on ${lastServedStr}`);
  } else {
    reasoning.push(
      `Last served ${daysSinceLastServed} days before on ${lastServedStr}`
    );
  }
};

const appendUpcomingServiceReasoning = (
  frequency: ScheduleFrequency,
  referenceDate: Date,
  orgTimeZone: string,
  reasoning: string[]
): void => {
  if (
    frequency.upcomingServices <= 0 ||
    frequency.nextUpcomingDate === undefined
  ) {
    return;
  }
  const nextDateStr = formatDate(frequency.nextUpcomingDate);
  const daysUntilNext = orgCalendarDaysBetween(
    referenceDate,
    frequency.nextUpcomingDate,
    orgTimeZone
  );
  if (frequency.upcomingServices === 1) {
    reasoning.push(
      daysUntilNext === 1
        ? `Upcoming: 1 day after on ${nextDateStr}`
        : `Upcoming: ${daysUntilNext} days after on ${nextDateStr}`
    );
  } else {
    reasoning.push(
      `Upcoming: ${frequency.upcomingServices} days scheduled (${daysUntilNext} days after on ${nextDateStr})`
    );
  }
  if (daysUntilNext <= 7) {
    reasoning.push(
      `Ranked lower: scheduled ${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"} after`
    );
  } else if (daysUntilNext <= 14) {
    reasoning.push(
      `Ranked slightly lower: scheduled ${daysUntilNext} days after`
    );
  } else if (daysUntilNext <= 21) {
    reasoning.push(`Minor penalty: scheduled ${daysUntilNext} days after`);
  }
};

const appendUpcomingRehearsalReasoning = (
  frequency: ScheduleFrequency,
  referenceDate: Date,
  orgTimeZone: string,
  reasoning: string[]
): void => {
  if (
    frequency.upcomingRehearsals <= 0 ||
    frequency.nextRehearsalDate === undefined
  ) {
    return;
  }
  const nextRehearsalStr = formatDate(frequency.nextRehearsalDate);
  const daysUntilRehearsal = orgCalendarDaysBetween(
    referenceDate,
    frequency.nextRehearsalDate,
    orgTimeZone
  );
  reasoning.push(
    frequency.upcomingRehearsals === 1
      ? `Rehearsal upcoming: ${daysUntilRehearsal} day${daysUntilRehearsal === 1 ? "" : "s"} after on ${nextRehearsalStr}`
      : `Rehearsals upcoming: ${frequency.upcomingRehearsals} scheduled (${daysUntilRehearsal} days after on ${nextRehearsalStr})`
  );
  if (daysUntilRehearsal <= 7) {
    reasoning.push(
      `Slight rehearsal penalty: rehearsal ${daysUntilRehearsal} day${daysUntilRehearsal === 1 ? "" : "s"} after`
    );
  } else if (daysUntilRehearsal <= 14) {
    reasoning.push(
      `Minor rehearsal penalty: rehearsal ${daysUntilRehearsal} days after`
    );
  }
};

const appendRecentLoadReasoning = (
  frequency: ScheduleFrequency,
  reasoning: string[]
): void => {
  const recentEngagementDays =
    frequency.recentServedDays + (frequency.recentRehearsalOnlyDays ?? 0);
  if (recentEngagementDays >= 3) {
    reasoning.push(
      `Ranked lower: on the schedule ${recentEngagementDays} distinct days in the ${formatPlanHistoryHalfRangeWeeksLabel()} before this plan`
    );
  }
  if (frequency.recentRehearsalOnlyDays >= 2) {
    reasoning.push(
      `Light penalty: rehearsed ${frequency.recentRehearsalOnlyDays} day${frequency.recentRehearsalOnlyDays === 1 ? "" : "s"} in the ${formatPlanHistoryHalfRangeWeeksLabel()} before this plan`
    );
  }
};

const calculateRecommendationScore = (
  person: PersonWithAvailability,
  referenceDate: Date,
  orgTimeZone: string
) => {
  const { frequency } = person;
  const reasoning: string[] = [];

  if (!frequency) {
    // Treat missing frequency data like a clean/no-load candidate instead of
    // artificially pushing them down the list with a low fallback score.
    reasoning.push(
      "No service history available (treated as no recent/upcoming load)"
    );
    return { score: 130, reasoning };
  }

  const baseScore = 100 - frequency.recentServedDays * 10;
  const daysSinceLastServed = frequency.lastServedDate
    ? orgCalendarDaysBetween(
        frequency.lastServedDate,
        referenceDate,
        orgTimeZone
      )
    : 999;
  const recencyBonus = Math.min(Math.max(daysSinceLastServed, 0), 30);
  const upcomingPenalty = (frequency.upcomingServices || 0) * 20;
  const upcomingRehearsalPenalty = (frequency.upcomingRehearsals || 0) * 8;

  const upcomingProximityPenalty = proximityPenalty(
    frequency.nextUpcomingDate,
    referenceDate,
    orgTimeZone,
    30,
    15
  );
  const rehearsalProximityPenalty = proximityPenalty(
    frequency.nextRehearsalDate,
    referenceDate,
    orgTimeZone,
    12,
    6
  );

  const recentRehearsalPenalty = (frequency.recentRehearsalOnlyDays || 0) * 4;

  const rawScore =
    baseScore +
    recencyBonus -
    upcomingPenalty -
    upcomingProximityPenalty -
    recentRehearsalPenalty -
    upcomingRehearsalPenalty -
    rehearsalProximityPenalty;

  appendLastServiceReasoning(frequency, daysSinceLastServed, reasoning);
  appendUpcomingServiceReasoning(
    frequency,
    referenceDate,
    orgTimeZone,
    reasoning
  );
  appendUpcomingRehearsalReasoning(
    frequency,
    referenceDate,
    orgTimeZone,
    reasoning
  );
  appendRecentLoadReasoning(frequency, reasoning);

  return { score: rawScore, reasoning };
};

export const scoreAndNormalizePeople = (
  people: PersonWithAvailability[],
  referenceDate: Date,
  orgTimeZone: string
) => {
  for (const person of people) {
    const { score, reasoning } = calculateRecommendationScore(
      person,
      referenceDate,
      orgTimeZone
    );
    person.recommendationScore = score;
    person.recommendationReasoning = reasoning;
  }

  const availablePeopleScores = people.flatMap((person) =>
    person.isBlockedForDate === true || person.recommendationScore === undefined
      ? []
      : [person.recommendationScore]
  );
  const minScore =
    availablePeopleScores.length > 0 ? Math.min(...availablePeopleScores) : 0;
  const maxScore =
    availablePeopleScores.length > 0 ? Math.max(...availablePeopleScores) : 100;
  const scoreRange = maxScore - minScore;

  for (const person of people) {
    if (
      person.recommendationScore !== undefined &&
      !(person.isBlockedForDate === true)
    ) {
      const normalizedScore =
        scoreRange > 0
          ? ((person.recommendationScore - minScore) / scoreRange) * 100
          : 50;
      person.recommendationScore = Math.round(normalizedScore * 100) / 100;
    }
  }
};

export const sortPeopleForSelection = (people: PersonWithAvailability[]) => {
  people.sort((a, b) => {
    if (
      a.isConfirmedForSelectedPlanPosition === true &&
      !(b.isConfirmedForSelectedPlanPosition === true)
    ) {
      return -1;
    }
    if (
      !(a.isConfirmedForSelectedPlanPosition === true) &&
      b.isConfirmedForSelectedPlanPosition === true
    ) {
      return 1;
    }

    if (
      a.isScheduledForSelectedPlanPosition === true &&
      !(b.isScheduledForSelectedPlanPosition === true)
    ) {
      return -1;
    }
    if (
      !(a.isScheduledForSelectedPlanPosition === true) &&
      b.isScheduledForSelectedPlanPosition === true
    ) {
      return 1;
    }

    if (a.isBlockedForDate === true && !(b.isBlockedForDate === true)) {
      return 1;
    }
    if (!(a.isBlockedForDate === true) && b.isBlockedForDate === true) {
      return -1;
    }

    const aScore = a.recommendationScore ?? 0;
    const bScore = b.recommendationScore ?? 0;
    const scoreDiff = bScore - aScore;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.fullName.localeCompare(b.fullName);
  });
};
