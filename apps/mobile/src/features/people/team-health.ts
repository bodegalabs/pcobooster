/**
 * Serving signals and team health, judged on the organization's calendar day. A port of the
 * web's `lib/team-health.ts` (see `dashboard.ts` for why it lives in the app).
 */
import {
  formatCalendarDateLabel,
  orgCalendarDaysRefMinusItem,
} from "@pcobooster/planning-center-models/calendar";

import type { DashboardPerson, RosterTeam, ServingRhythm } from "./types";

/** Nobody is "due" sooner than this, however often they usually serve. */
const DUE_FLOOR_DAYS = 42;
/** A regular counts as drifting only after this long, and twice their usual gap. */
const DRIFT_FLOOR_DAYS = 56;
const DUE_GAP_MULTIPLIER = 1.5;
const DRIFT_GAP_MULTIPLIER = 2;
/** Served days in the last 180 that make someone a regular. */
const REGULAR_SERVED_DAYS = 3;
const DECLINE_MIN_COUNT = 2;
const DECLINE_MIN_RATE = 0.4;
/** Unanswered requests this close are waiting on a reply. */
const WAITING_WINDOW_DAYS = 7;
/**
 * Serving days in 30 that count as heavy: twice the team's own 30-day pace, never below weekly
 * (4) and always past weekly with extras (6). Without a known pace, only weekly with extras.
 */
const HEAVY_30_MIN_DAYS = 4;
const HEAVY_30_MAX_DAYS = 6;
const DAYS_90_PER_30 = 3;
const OVERLOAD_MIN_DAYS_90 = 6;
const OVERLOAD_TEAM_MULTIPLIER = 2;
/** Team comparisons need a few active people to mean anything. */
const MIN_ACTIVE_FOR_TEAM_PACE = 3;
const TOP_SHARE_FRACTION = 0.2;
const MIN_MEMBERS_FOR_HEALTH = 3;
const STRETCHED_TOP_SHARE = 0.6;
const STRETCHED_MIN_SERVED_DAYS = 10;
const THIN_ACTIVE_RATE = 0.5;
const DAYS_PER_WEEK = 7;
const WEEKS_PER_MONTH = 4;
const FORTNIGHT_DAYS = 14;
const TWO_MONTHS_DAYS = 60;
const DAYS_PER_MONTH = 30;
const PERCENT = 100;

/** Pastoral reasons to reach out: how someone is serving, not admin. */
export type CheckInReason =
  | {
      readonly kind: "declining";
      readonly declined: number;
      readonly requests: number;
    }
  | {
      readonly kind: "drifting";
      readonly lastServedOn: string;
      readonly typicalGapDays: number | null;
    }
  | {
      readonly kind: "overloaded";
      readonly basis: "recent" | "upcoming" | "team-pace";
      readonly days: number;
      readonly teamPace: number | null;
    };

/** Everything the dashboard says about one person, most pressing first. */
export type PersonSignal =
  | CheckInReason
  | {
      readonly kind: "waiting";
      /** The soonest unanswered request, within the next week. */
      readonly nextPendingOn: string;
      /** Unanswered requests ahead, including later ones. */
      readonly pending: number;
    }
  | {
      readonly kind: "due";
      /** Days since they last served; null when they have not served in 180 days. */
      readonly daysSinceServed: number | null;
      readonly typicalGapDays: number | null;
    };

export type TeamHealthStatus = "steady" | "stretched" | "thin";

export interface TeamHealth {
  readonly memberCount: number;
  /** Served at least once in the last 90 days. */
  readonly activeCount: number;
  /** The busiest fifth of the team, at least one person. */
  readonly topCount: number;
  /** Share of 90-day serving days the busiest `topCount` covered; null without serving. */
  readonly topShare: number | null;
  /** Null for teams too small to judge. */
  readonly status: TeamHealthStatus | null;
  /** Each member's signals. */
  readonly signalsById: ReadonlyMap<string, readonly PersonSignal[]>;
}

const median = (values: readonly number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const daysSince = (dayKey: string | null, todayKey: string): number | null =>
  dayKey === null ? null : orgCalendarDaysRefMinusItem(dayKey, todayKey);

const dueThresholdDays = (typicalGapDays: number | null): number =>
  typicalGapDays === null
    ? DUE_FLOOR_DAYS
    : Math.max(DUE_FLOOR_DAYS, Math.round(typicalGapDays * DUE_GAP_MULTIPLIER));

const driftThresholdDays = (typicalGapDays: number | null): number =>
  typicalGapDays === null
    ? DRIFT_FLOOR_DAYS
    : Math.max(
        DRIFT_FLOOR_DAYS,
        Math.round(typicalGapDays * DRIFT_GAP_MULTIPLIER)
      );

/** A usual pace: the median of active people's 90-day serving days. */
const computeTeamPace = (
  members: readonly DashboardPerson[]
): number | null => {
  const active = members.flatMap(({ rhythm: { servedDays90 } }) =>
    servedDays90 > 0 ? [servedDays90] : []
  );
  return active.length >= MIN_ACTIVE_FOR_TEAM_PACE ? median(active) : null;
};

/**
 * Each person's team pace: the busiest pace among the teams they serve on, over the loaded
 * people of each team. The list and the person page both judge a heavy load against it.
 */
export const computeMemberPaces = (
  members: readonly DashboardPerson[],
  teams: readonly Pick<RosterTeam, "personIds">[]
): ReadonlyMap<string, number> => {
  const byId = new Map(members.map((member) => [member.id, member]));
  const paces = new Map<string, number>();
  for (const team of teams) {
    const loaded = team.personIds.flatMap((personId) => {
      const member = byId.get(personId);
      return member === undefined ? [] : [member];
    });
    const pace = computeTeamPace(loaded);
    if (pace === null) {
      continue;
    }
    for (const member of loaded) {
      paces.set(member.id, Math.max(pace, paces.get(member.id) ?? 0));
    }
  }
  return paces;
};

const heavyThirtyDayLoad = (teamPace: number | null): number =>
  teamPace === null
    ? HEAVY_30_MAX_DAYS
    : Math.min(
        HEAVY_30_MAX_DAYS,
        Math.max(
          HEAVY_30_MIN_DAYS,
          Math.ceil((teamPace / DAYS_90_PER_30) * OVERLOAD_TEAM_MULTIPLIER)
        )
      );

const overloadReason = (
  rhythm: ServingRhythm,
  teamPace: number | null
): CheckInReason | null => {
  const heavy = heavyThirtyDayLoad(teamPace);
  if (rhythm.servedDays30 >= heavy) {
    return {
      kind: "overloaded",
      basis: "recent",
      days: rhythm.servedDays30,
      teamPace,
    };
  }
  if (rhythm.upcomingDays30 >= heavy) {
    return {
      kind: "overloaded",
      basis: "upcoming",
      days: rhythm.upcomingDays30,
      teamPace,
    };
  }
  if (
    teamPace !== null &&
    rhythm.servedDays90 >= OVERLOAD_MIN_DAYS_90 &&
    rhythm.servedDays90 >= teamPace * OVERLOAD_TEAM_MULTIPLIER
  ) {
    return {
      kind: "overloaded",
      basis: "team-pace",
      days: rhythm.servedDays90,
      teamPace,
    };
  }
  return null;
};

const checkInReasons = (
  rhythm: ServingRhythm,
  todayKey: string,
  teamPace: number | null
): CheckInReason[] => {
  const reasons: CheckInReason[] = [];
  if (
    rhythm.declined180 >= DECLINE_MIN_COUNT &&
    rhythm.declined180 / Math.max(rhythm.requests180, 1) >= DECLINE_MIN_RATE
  ) {
    reasons.push({
      kind: "declining",
      declined: rhythm.declined180,
      requests: rhythm.requests180,
    });
  }
  const sinceServed = daysSince(rhythm.lastServedOn, todayKey);
  if (
    rhythm.lastServedOn !== null &&
    sinceServed !== null &&
    rhythm.nextServingOn === null &&
    rhythm.servedDays180 >= REGULAR_SERVED_DAYS &&
    sinceServed >= driftThresholdDays(rhythm.typicalGapDays)
  ) {
    reasons.push({
      kind: "drifting",
      lastServedOn: rhythm.lastServedOn,
      typicalGapDays: rhythm.typicalGapDays,
    });
  }
  const overloaded = overloadReason(rhythm, teamPace);
  if (overloaded !== null) {
    reasons.push(overloaded);
  }
  return reasons;
};

/** Everything the dashboard says about someone, on org day `todayKey`, most pressing first. */
export const personSignals = (
  rhythm: ServingRhythm,
  todayKey: string,
  teamPace: number | null
): PersonSignal[] => {
  const signals: PersonSignal[] = [];
  const sincePending = daysSince(rhythm.nextPendingOn, todayKey);
  if (
    rhythm.pendingUpcoming > 0 &&
    rhythm.nextPendingOn !== null &&
    sincePending !== null &&
    -sincePending <= WAITING_WINDOW_DAYS
  ) {
    signals.push({
      kind: "waiting",
      nextPendingOn: rhythm.nextPendingOn,
      pending: rhythm.pendingUpcoming,
    });
  }
  signals.push(...checkInReasons(rhythm, todayKey, teamPace));
  if (rhythm.nextServingOn === null) {
    const sinceServed = daysSince(rhythm.lastServedOn, todayKey);
    if (
      sinceServed === null ||
      sinceServed >= dueThresholdDays(rhythm.typicalGapDays)
    ) {
      signals.push({
        kind: "due",
        daysSinceServed: sinceServed,
        typicalGapDays: rhythm.typicalGapDays,
      });
    }
  }
  return signals;
};

const topServingShare = (
  members: readonly DashboardPerson[],
  topCount: number
): number | null => {
  const days = members
    .map((member) => member.rhythm.servedDays90)
    .toSorted((a, b) => b - a);
  const total = days.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return null;
  }
  return days.slice(0, topCount).reduce((sum, value) => sum + value, 0) / total;
};

/** Team health for the loaded members on org day `todayKey`. */
export const computeTeamHealth = (
  members: readonly DashboardPerson[],
  teams: readonly Pick<RosterTeam, "personIds">[],
  todayKey: string
): TeamHealth => {
  const paces = computeMemberPaces(members, teams);
  const signalsById = new Map(
    members.map((member) => [
      member.id,
      personSignals(member.rhythm, todayKey, paces.get(member.id) ?? null),
    ])
  );
  const activeCount = members.filter(
    (member) => member.rhythm.servedDays90 > 0
  ).length;
  const topCount = Math.max(1, Math.ceil(members.length * TOP_SHARE_FRACTION));
  const topShare = topServingShare(members, topCount);
  const servedDays = members.reduce(
    (total, member) => total + member.rhythm.servedDays90,
    0
  );
  let status: TeamHealthStatus | null = "steady";
  if (members.length < MIN_MEMBERS_FOR_HEALTH) {
    status = null;
  } else if (activeCount / members.length < THIN_ACTIVE_RATE) {
    status = "thin";
  } else if (
    topShare !== null &&
    topShare >= STRETCHED_TOP_SHARE &&
    servedDays >= STRETCHED_MIN_SERVED_DAYS
  ) {
    status = "stretched";
  }
  return {
    memberCount: members.length,
    activeCount,
    topCount,
    topShare,
    status,
    signalsById,
  };
};

const people = (count: number): string => (count === 1 ? "person" : "people");

/** "4 of 5 people served in the last 90 days, but the busiest 1 person covered 75% of serving days." */
export const describeHealth = (health: TeamHealth): string => {
  const served = `${health.activeCount} of ${health.memberCount} ${people(health.memberCount)} served in the last 90 days`;
  if (health.status === "thin") {
    return `Only ${served}. Consider who could step back in.`;
  }
  if (health.status === "stretched" && health.topShare !== null) {
    return `${served}, but the busiest ${health.topCount} ${people(health.topCount)} covered ${Math.round(health.topShare * PERCENT)}% of serving days.`;
  }
  if (health.status === "steady") {
    return `${served}, and serving is spread across the team.`;
  }
  return `${served}.`;
};

/** "Jul 12" for an org `YYYY-MM-DD` day. */
export const formatDayKey = (dayKey: string): string =>
  // UTC noon on the org day: a civil-date carrier, so it is read in UTC.
  formatCalendarDateLabel(new Date(`${dayKey}T12:00:00Z`), "UTC", "monthDay");

/** "Sun, Jul 12" for an org `YYYY-MM-DD` day. */
export const formatWeekdayDayKey = (dayKey: string): string =>
  formatCalendarDateLabel(
    new Date(`${dayKey}T12:00:00Z`),
    "UTC",
    "weekdayMonthDay"
  );

/** "every week", "every 3 weeks", "about monthly" for a typical gap in days. */
export const describeCadence = (typicalGapDays: number): string => {
  const weeks = Math.max(1, Math.round(typicalGapDays / DAYS_PER_WEEK));
  if (weeks === 1) {
    return "every week";
  }
  if (weeks === WEEKS_PER_MONTH) {
    return "about monthly";
  }
  return `every ${weeks} weeks`;
};

/** "3 weeks ago", "yesterday" for a count of days. */
export const describeDaysAgo = (days: number): string => {
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < FORTNIGHT_DAYS) {
    return `${days} days ago`;
  }
  if (days < TWO_MONTHS_DAYS) {
    return `${Math.round(days / DAYS_PER_WEEK)} weeks ago`;
  }
  return `${Math.round(days / DAYS_PER_MONTH)} months ago`;
};

export interface PersonSignalText {
  /** A badge-length name, such as "Drifting". */
  readonly label: string;
  /** One sentence with the numbers behind it. */
  readonly detail: string;
}

/** A short label and a sentence for a person's signal. */
export const describeSignal = (signal: PersonSignal): PersonSignalText => {
  switch (signal.kind) {
    case "waiting": {
      const later = signal.pending > 1 ? ` (${signal.pending} open)` : "";
      return {
        label: "No reply",
        detail: `Hasn't answered for ${formatWeekdayDayKey(signal.nextPendingOn)}${later}.`,
      };
    }
    case "declining": {
      return {
        label: "Declining",
        detail: `Declined ${signal.declined} of ${signal.requests} requests in 6 months.`,
      };
    }
    case "drifting": {
      const cadence =
        signal.typicalGapDays === null
          ? ""
          : `, usually ${describeCadence(signal.typicalGapDays)}`;
      return {
        label: "Drifting",
        detail: `Last served ${formatDayKey(signal.lastServedOn)}${cadence}; nothing scheduled.`,
      };
    }
    case "overloaded": {
      if (signal.basis === "recent") {
        return {
          label: "Heavy load",
          detail: `Served ${signal.days} days in the last 30.`,
        };
      }
      if (signal.basis === "upcoming") {
        return {
          label: "Heavy load",
          detail: `Scheduled ${signal.days} days in the next 30.`,
        };
      }
      const pace =
        signal.teamPace === null
          ? ""
          : ` (team median ${Math.round(signal.teamPace)})`;
      return {
        label: "Heavy load",
        detail: `Served ${signal.days} days in 90${pace}.`,
      };
    }
    case "due": {
      if (signal.daysSinceServed === null) {
        return {
          label: "Not serving",
          detail: "No serving in the last 6 months; nothing scheduled.",
        };
      }
      const cadence =
        signal.typicalGapDays === null
          ? ""
          : ` · usually ${describeCadence(signal.typicalGapDays)}`;
      return {
        label: "Due",
        detail: `Last served ${describeDaysAgo(signal.daysSinceServed)}${cadence}; nothing scheduled.`,
      };
    }
    default: {
      return signal satisfies never;
    }
  }
};

/**
 * Signals worth a list badge. Being due is common and the list's dates already show it, so only
 * someone who has not served at all stands out.
 */
export const isListSignal = (signal: PersonSignal): boolean =>
  signal.kind !== "due" || signal.daysSinceServed === null;

/** The people a leader should look at: anyone with a waiting reply, check-in, or due slot. */
export const needsAttention = (
  signals: readonly PersonSignal[] | undefined
): boolean => signals !== undefined && signals.length > 0;
