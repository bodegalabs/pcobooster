import type {
  PeopleDashboardPerson,
  PeopleDashboardTeam,
  ServingRhythm,
} from "@pcobooster/contracts/people-schemas";
import {
  formatCalendarDateLabel,
  orgCalendarDaysRefMinusItem,
} from "@pcobooster/planning-center-models/calendar";

/** Nobody is "due" sooner than this, however often they usually serve. */
export const DUE_FLOOR_DAYS = 42;
/** A regular server counts as drifting only after this long, and twice their usual gap. */
const DRIFT_FLOOR_DAYS = 56;
const DUE_GAP_MULTIPLIER = 1.5;
const DRIFT_GAP_MULTIPLIER = 2;
/** Served days in the last 180 that make someone a regular. */
const REGULAR_SERVED_DAYS = 3;
const DECLINE_MIN_COUNT = 2;
const DECLINE_MIN_RATE = 0.4;
/** Unanswered requests this close are waiting on a reply. */
export const WAITING_WINDOW_DAYS = 7;
/**
 * Serving days in 30 that count as heavy: twice the team's own 30-day pace,
 * but never below weekly (4) and always past weekly with extras (6), so a
 * team that serves every week is not flagged for serving every week. Without
 * a known pace, only weekly with extras counts.
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

/** Pastoral reasons to reach out: how someone is serving, not admin. */
export type CheckInReason =
  | { kind: "declining"; declined: number; requests: number }
  | {
      kind: "drifting";
      lastServedOn: string;
      typicalGapDays: number | null;
    }
  | {
      kind: "overloaded";
      basis: "recent" | "upcoming" | "team-pace";
      days: number;
      teamPace: number | null;
    };

export interface WaitingReply {
  /** The soonest unanswered request, within the next week. */
  nextPendingOn: string;
  /** Unanswered requests ahead, including later ones. */
  pending: number;
}

export interface DueSlot {
  /** Days since they last served; null when they have not served in 180 days. */
  daysSinceServed: number | null;
  typicalGapDays: number | null;
}

/** Everything the dashboard says about one person, most pressing first. */
export type PersonSignal =
  | CheckInReason
  | ({ kind: "waiting" } & WaitingReply)
  | ({ kind: "due" } & DueSlot);

export interface CheckIn {
  member: PeopleDashboardPerson;
  reasons: CheckInReason[];
}

export type WaitingOnReply = { member: PeopleDashboardPerson } & WaitingReply;

export type DueForSlot = { member: PeopleDashboardPerson } & DueSlot;

export type TeamHealthStatus = "steady" | "stretched" | "thin";

export interface TeamHealth {
  memberCount: number;
  /** Served at least once in the last 90 days. */
  activeCount: number;
  /** Serving at least once in the next 30 days. */
  scheduledAheadCount: number;
  declined: number;
  requests: number;
  pendingCount: number;
  /** The busiest fifth of the team, at least one person. */
  topCount: number;
  /** Share of 90-day serving days the busiest `topCount` covered; null without serving. */
  topShare: number | null;
  /** Median 90-day serving days among active people in scope; null with too few. */
  teamPace: number | null;
  /** Null for teams too small to judge. */
  status: TeamHealthStatus | null;
  waitingOnReply: WaitingOnReply[];
  checkIns: CheckIn[];
  dueForSlot: DueForSlot[];
  /** Each member's signals, for the roster. */
  signalsById: ReadonlyMap<string, readonly PersonSignal[]>;
}

const median = (values: readonly number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const daysSince = (dayKey: string | null, todayKey: string) =>
  dayKey === null ? null : orgCalendarDaysRefMinusItem(dayKey, todayKey);

/** Days without serving after which someone is due for a slot. */
export const dueThresholdDays = (typicalGapDays: number | null) =>
  typicalGapDays === null
    ? DUE_FLOOR_DAYS
    : Math.max(DUE_FLOOR_DAYS, Math.round(typicalGapDays * DUE_GAP_MULTIPLIER));

const driftThresholdDays = (typicalGapDays: number | null) =>
  typicalGapDays === null
    ? DRIFT_FLOOR_DAYS
    : Math.max(
        DRIFT_FLOOR_DAYS,
        Math.round(typicalGapDays * DRIFT_GAP_MULTIPLIER)
      );

/** A usual pace: the median of active people's 90-day serving days. */
export const computeTeamPace = (members: readonly PeopleDashboardPerson[]) => {
  const active = members.flatMap(({ rhythm: { servedDays90 } }) =>
    servedDays90 > 0 ? [servedDays90] : []
  );
  return active.length >= MIN_ACTIVE_FOR_TEAM_PACE ? median(active) : null;
};

/**
 * Each person's team pace: the busiest pace among the teams they serve on, over the loaded
 * people of each team. The dashboard and the person page both judge a heavy load against it.
 */
export const computeMemberPaces = (
  members: readonly PeopleDashboardPerson[],
  teams: readonly Pick<PeopleDashboardTeam, "personIds">[]
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

/** Serving days in 30 that count as a heavy load for this pace. */
export const heavyThirtyDayLoad = (teamPace: number | null) =>
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

/** An unanswered request in the next week; null when nothing is that close. */
export const waitingReply = (
  rhythm: ServingRhythm,
  todayKey: string
): WaitingReply | null => {
  const sincePending = daysSince(rhythm.nextPendingOn, todayKey);
  if (
    rhythm.pendingUpcoming === 0 ||
    rhythm.nextPendingOn === null ||
    sincePending === null ||
    -sincePending > WAITING_WINDOW_DAYS
  ) {
    return null;
  }
  return {
    nextPendingOn: rhythm.nextPendingOn,
    pending: rhythm.pendingUpcoming,
  };
};

/** Why a leader might reach out to this person, most pressing first. */
export const checkInReasons = (
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
  if (overloaded) {
    reasons.push(overloaded);
  }
  return reasons;
};

/** Nothing scheduled and past their usual gap; null when they are not due. */
export const dueSlot = (
  rhythm: ServingRhythm,
  todayKey: string
): DueSlot | null => {
  if (rhythm.nextServingOn !== null) {
    return null;
  }
  const sinceServed = daysSince(rhythm.lastServedOn, todayKey);
  if (
    sinceServed !== null &&
    sinceServed < dueThresholdDays(rhythm.typicalGapDays)
  ) {
    return null;
  }
  return {
    daysSinceServed: sinceServed,
    typicalGapDays: rhythm.typicalGapDays,
  };
};

/** Everything the dashboard lists someone under, in the order its lists appear. */
export const personSignals = (
  rhythm: ServingRhythm,
  todayKey: string,
  teamPace: number | null
): PersonSignal[] => {
  const signals: PersonSignal[] = [];
  const waiting = waitingReply(rhythm, todayKey);
  if (waiting) {
    signals.push({ kind: "waiting", ...waiting });
  }
  signals.push(...checkInReasons(rhythm, todayKey, teamPace));
  const due = dueSlot(rhythm, todayKey);
  if (due) {
    signals.push({ kind: "due", ...due });
  }
  return signals;
};

/** Longest overdue relative to their own rhythm first; people with no recent serving last. */
const compareDue = (a: DueForSlot, b: DueForSlot) => {
  if (a.daysSinceServed === null || b.daysSinceServed === null) {
    if (a.daysSinceServed !== b.daysSinceServed) {
      return a.daysSinceServed === null ? 1 : -1;
    }
    return a.member.name.localeCompare(b.member.name);
  }
  return (
    b.daysSinceServed / dueThresholdDays(b.typicalGapDays) -
    a.daysSinceServed / dueThresholdDays(a.typicalGapDays)
  );
};

const topServingShare = (
  members: readonly PeopleDashboardPerson[],
  topCount: number
) => {
  const days = members
    .map((member) => member.rhythm.servedDays90)
    .toSorted((a, b) => b - a);
  const total = days.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return null;
  }
  const top = days.slice(0, topCount).reduce((sum, value) => sum + value, 0);
  return top / total;
};

const healthStatus = ({
  memberCount,
  activeCount,
  topShare,
  servedDays,
}: {
  memberCount: number;
  activeCount: number;
  topShare: number | null;
  servedDays: number;
}): TeamHealthStatus | null => {
  if (memberCount < MIN_MEMBERS_FOR_HEALTH) {
    return null;
  }
  if (activeCount / memberCount < THIN_ACTIVE_RATE) {
    return "thin";
  }
  if (
    topShare !== null &&
    topShare >= STRETCHED_TOP_SHARE &&
    servedDays >= STRETCHED_MIN_SERVED_DAYS
  ) {
    return "stretched";
  }
  return "steady";
};

/** Each loaded person's signals, heavy loads judged against their own teams' pace. */
export const computePersonSignals = (
  members: readonly PeopleDashboardPerson[],
  teams: readonly Pick<PeopleDashboardTeam, "personIds">[],
  todayKey: string
): ReadonlyMap<string, readonly PersonSignal[]> => {
  const paces = computeMemberPaces(members, teams);
  return new Map(
    members.map((member) => [
      member.id,
      personSignals(member.rhythm, todayKey, paces.get(member.id) ?? null),
    ])
  );
};

/**
 * Team health for the loaded members, on the org calendar day `todayKey`. Heavy loads compare
 * each person with their own teams (`teams`), not the whole scope.
 */
export const computeTeamHealth = (
  members: readonly PeopleDashboardPerson[],
  teams: readonly Pick<PeopleDashboardTeam, "personIds">[],
  todayKey: string
): TeamHealth => {
  const signalsById = computePersonSignals(members, teams, todayKey);
  const waitingOnReply: WaitingOnReply[] = [];
  const checkIns: CheckIn[] = [];
  const dueForSlot: DueForSlot[] = [];
  for (const member of members) {
    const reasons: CheckInReason[] = [];
    for (const signal of signalsById.get(member.id) ?? []) {
      if (signal.kind === "waiting") {
        const { kind: _kind, ...waiting } = signal;
        waitingOnReply.push({ member, ...waiting });
      } else if (signal.kind === "due") {
        const { kind: _kind, ...due } = signal;
        dueForSlot.push({ member, ...due });
      } else {
        reasons.push(signal);
      }
    }
    if (reasons.length > 0) {
      checkIns.push({ member, reasons });
    }
  }
  const activeCount = members.filter(
    (member) => member.rhythm.servedDays90 > 0
  ).length;
  const topCount = Math.max(1, Math.ceil(members.length * TOP_SHARE_FRACTION));
  const topShare = topServingShare(members, topCount);
  const sum = (pick: (rhythm: ServingRhythm) => number) =>
    members.reduce((total, member) => total + pick(member.rhythm), 0);

  return {
    memberCount: members.length,
    activeCount,
    scheduledAheadCount: members.filter(
      (member) => member.rhythm.upcomingDays30 > 0
    ).length,
    declined: sum((rhythm) => rhythm.declined180),
    requests: sum((rhythm) => rhythm.requests180),
    pendingCount: sum((rhythm) => rhythm.pendingUpcoming),
    topCount,
    topShare,
    teamPace: computeTeamPace(members),
    status: healthStatus({
      memberCount: members.length,
      activeCount,
      topShare,
      servedDays: sum((rhythm) => rhythm.servedDays90),
    }),
    waitingOnReply: waitingOnReply.toSorted(
      (a, b) =>
        a.nextPendingOn.localeCompare(b.nextPendingOn) ||
        a.member.name.localeCompare(b.member.name)
    ),
    checkIns: checkIns.toSorted(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        a.member.name.localeCompare(b.member.name)
    ),
    dueForSlot: dueForSlot.toSorted(compareDue),
    signalsById,
  };
};

/** "Jul 12" for an org `YYYY-MM-DD` day. */
export const formatDayKey = (dayKey: string) =>
  // UTC noon on the org day: a civil-date carrier, so read it in UTC.
  formatCalendarDateLabel(new Date(`${dayKey}T12:00:00Z`), "UTC", "monthDay");

/** "Sun, Jul 12" for an org `YYYY-MM-DD` day. */
export const formatWeekdayDayKey = (dayKey: string) =>
  formatCalendarDateLabel(
    new Date(`${dayKey}T12:00:00Z`),
    "UTC",
    "weekdayMonthDay"
  );

/** "every week", "every 3 weeks", "about monthly" for a typical gap in days. */
export const describeCadence = (typicalGapDays: number) => {
  const weeks = Math.max(1, Math.round(typicalGapDays / 7));
  if (weeks === 1) {
    return "every week";
  }
  if (weeks === 4) {
    return "about monthly";
  }
  return `every ${weeks} weeks`;
};

/** "3 weeks ago", "yesterday" for a count of days. */
export const describeDaysAgo = (days: number) => {
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 14) {
    return `${days} days ago`;
  }
  if (days < 60) {
    return `${Math.round(days / 7)} weeks ago`;
  }
  return `${Math.round(days / 30)} months ago`;
};

/** "Last served 3 weeks ago · usually every 2 weeks", or that they have not served lately. */
export const describeDue = ({ daysSinceServed, typicalGapDays }: DueSlot) => {
  if (daysSinceServed === null) {
    return "No serving in the last 6 months";
  }
  const cadence =
    typicalGapDays === null
      ? ""
      : ` · usually ${describeCadence(typicalGapDays)}`;
  return `Last served ${describeDaysAgo(daysSinceServed)}${cadence}`;
};

export interface PersonSignalText {
  /** A badge-length name, such as "Drifting". */
  label: string;
  /** One sentence with the numbers behind it. */
  detail: string;
}

const describeOverload = (
  reason: Extract<CheckInReason, { kind: "overloaded" }>
): PersonSignalText => {
  if (reason.basis === "recent") {
    return {
      label: "Heavy load",
      detail: `Served ${reason.days} days in the last 30.`,
    };
  }
  if (reason.basis === "upcoming") {
    return {
      label: "Heavy load",
      detail: `Scheduled ${reason.days} days in the next 30.`,
    };
  }
  const pace =
    reason.teamPace === null
      ? ""
      : ` (team median ${Math.round(reason.teamPace)})`;
  return {
    label: "Heavy load",
    detail: `Served ${reason.days} days in 90${pace}.`,
  };
};

/** A short label and a sentence for a person's signal. */
export const describePersonSignal = (
  signal: PersonSignal
): PersonSignalText => {
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
      return describeOverload(signal);
    }
    case "due": {
      return signal.daysSinceServed === null
        ? {
            label: "Not serving",
            detail: "No serving in the last 6 months; nothing scheduled.",
          }
        : {
            label: "Due",
            detail: `${describeDue(signal)}; nothing scheduled.`,
          };
    }
    default: {
      return signal satisfies never;
    }
  }
};

/**
 * Signals worth a roster badge. Being due is common and the roster's dates already show it, so
 * only someone who has not served at all stands out.
 */
export const isRosterSignal = (signal: PersonSignal) =>
  signal.kind !== "due" || signal.daysSinceServed === null;
