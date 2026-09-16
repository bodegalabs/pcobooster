import { orgCalendarDaysBetween } from "@/lib/planning-center/org-calendar";
import { PLAN_HISTORY_HALF_RANGE_DAYS } from "@/lib/planning-center/schedule-load-constants";
import type { PersonWithAvailability } from "@/lib/types";

function calculateRecommendationScore(
  person: PersonWithAvailability,
  referenceDate: Date,
  orgTimeZone: string
): { score: number; reasoning: string[] } {
  const frequency = person.frequency;
  const reasoning: string[] = [];

  if (!frequency) {
    // Treat missing frequency data like a clean/no-load candidate instead of
    // artificially pushing them down the list with a low fallback score.
    reasoning.push(
      "No service history available (treated as no recent/upcoming load)"
    );
    return { score: 130, reasoning };
  }

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);

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

  let proximityPenalty = 0;
  if (frequency.nextUpcomingDate) {
    const daysUntilNext = orgCalendarDaysBetween(
      referenceDate,
      frequency.nextUpcomingDate,
      orgTimeZone
    );
    if (daysUntilNext <= 7) proximityPenalty = 30;
    else if (daysUntilNext <= 14) proximityPenalty = 15;
  }

  let rehearsalProximityPenalty = 0;
  if (frequency.nextRehearsalDate) {
    const daysUntilRehearsal = orgCalendarDaysBetween(
      referenceDate,
      frequency.nextRehearsalDate,
      orgTimeZone
    );
    if (daysUntilRehearsal <= 7) rehearsalProximityPenalty = 12;
    else if (daysUntilRehearsal <= 14) rehearsalProximityPenalty = 6;
  }

  const recentRehearsalPenalty = (frequency.recentRehearsalOnlyDays || 0) * 4;

  const rawScore =
    baseScore +
    recencyBonus -
    upcomingPenalty -
    proximityPenalty -
    recentRehearsalPenalty -
    upcomingRehearsalPenalty -
    rehearsalProximityPenalty;

  if (frequency.lastServedDate === undefined && frequency.totalServed === 0) {
    reasoning.push("No past services scheduled");
  } else if (frequency.lastServedDate) {
    const lastServedStr = formatDate(frequency.lastServedDate);
    if (daysSinceLastServed === 0)
      reasoning.push(`Last served on the same date (${lastServedStr})`);
    else if (daysSinceLastServed === 1)
      reasoning.push(`Last served 1 day before on ${lastServedStr}`);
    else
      reasoning.push(
        `Last served ${daysSinceLastServed} days before on ${lastServedStr}`
      );
  }

  if (frequency.upcomingServices > 0 && frequency.nextUpcomingDate) {
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

    if (daysUntilNext <= 7)
      reasoning.push(
        `Ranked lower: scheduled ${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"} after`
      );
    else if (daysUntilNext <= 14)
      reasoning.push(
        `Ranked slightly lower: scheduled ${daysUntilNext} days after`
      );
    else if (daysUntilNext <= 21)
      reasoning.push(`Minor penalty: scheduled ${daysUntilNext} days after`);
  }

  if (frequency.upcomingRehearsals > 0 && frequency.nextRehearsalDate) {
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

    if (daysUntilRehearsal <= 7)
      reasoning.push(
        `Slight rehearsal penalty: rehearsal ${daysUntilRehearsal} day${daysUntilRehearsal === 1 ? "" : "s"} after`
      );
    else if (daysUntilRehearsal <= 14)
      reasoning.push(
        `Minor rehearsal penalty: rehearsal ${daysUntilRehearsal} days after`
      );
  }

  const recentEngagementDays =
    frequency.recentServedDays + (frequency.recentRehearsalOnlyDays ?? 0);
  if (recentEngagementDays >= 3) {
    reasoning.push(
      `Ranked lower: on the schedule ${recentEngagementDays} distinct days in the ${PLAN_HISTORY_HALF_RANGE_DAYS} days before this plan`
    );
  }

  if (frequency.recentRehearsalOnlyDays >= 2) {
    reasoning.push(
      `Light penalty: rehearsed ${frequency.recentRehearsalOnlyDays} day${frequency.recentRehearsalOnlyDays === 1 ? "" : "s"} in the ${PLAN_HISTORY_HALF_RANGE_DAYS} days before this plan`
    );
  }

  return { score: rawScore, reasoning };
}

export function scoreAndNormalizePeople(
  people: PersonWithAvailability[],
  referenceDate: Date,
  orgTimeZone: string
) {
  people.forEach((person) => {
    const { score, reasoning } = calculateRecommendationScore(
      person,
      referenceDate,
      orgTimeZone
    );
    person.recommendationScore = score;
    person.recommendationReasoning = reasoning;
  });

  const availablePeopleScores = people
    .filter((p) => !p.isBlockedForDate && p.recommendationScore !== undefined)
    .map((p) => p.recommendationScore as number);
  const minScore =
    availablePeopleScores.length > 0 ? Math.min(...availablePeopleScores) : 0;
  const maxScore =
    availablePeopleScores.length > 0 ? Math.max(...availablePeopleScores) : 100;
  const scoreRange = maxScore - minScore;

  people.forEach((person) => {
    if (person.recommendationScore !== undefined && !person.isBlockedForDate) {
      const normalizedScore =
        scoreRange > 0
          ? ((person.recommendationScore - minScore) / scoreRange) * 100
          : 50;
      person.recommendationScore = Math.round(normalizedScore * 100) / 100;
    }
  });
}

export function sortPeopleForSelection(people: PersonWithAvailability[]) {
  people.sort((a, b) => {
    if (
      a.isConfirmedForSelectedPlanPosition &&
      !b.isConfirmedForSelectedPlanPosition
    )
      return -1;
    if (
      !a.isConfirmedForSelectedPlanPosition &&
      b.isConfirmedForSelectedPlanPosition
    )
      return 1;

    if (
      a.isScheduledForSelectedPlanPosition &&
      !b.isScheduledForSelectedPlanPosition
    )
      return -1;
    if (
      !a.isScheduledForSelectedPlanPosition &&
      b.isScheduledForSelectedPlanPosition
    )
      return 1;

    if (a.isBlockedForDate && !b.isBlockedForDate) return 1;
    if (!a.isBlockedForDate && b.isBlockedForDate) return -1;

    const aScore = a.recommendationScore || 0;
    const bScore = b.recommendationScore || 0;
    const scoreDiff = bScore - aScore;
    if (scoreDiff !== 0) return scoreDiff;
    return a.fullName.localeCompare(b.fullName);
  });
}
