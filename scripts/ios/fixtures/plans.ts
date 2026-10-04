import {
  EVENTS,
  P,
  SUNDAY,
  T,
  VIEWER_ID,
  YOUTH,
  isBlockedOn,
  personById,
  rosterFor,
  senderName,
  teamsFor,
} from "./organization";
import type { PersonSeed, PositionSeed, TeamSeed } from "./organization";
import { liveArrangement, songById, songByTitle, songs } from "./songs";
import type { ArrangementSeed, KeySeed, SongSeed } from "./songs";
import {
  ANCHOR_NOW,
  ANCHOR_SUNDAY,
  ANCHOR_TODAY,
  addDays,
  addHours,
  at,
  compactDay,
  daysBetween,
  daysEvery,
  minusDays,
  unit,
  weeksFromAnchor,
} from "./time";

/**
 * Every plan the fixtures know, with its times, lineup, and songs. Lineups are generated from
 * the marketing replica's serving history plus a deterministic rotation, so the Lineup, Assign,
 * and People screens all read one consistent schedule.
 */

export type TimeType = "service" | "rehearsal" | "other";

export interface TimeSeed {
  readonly id: string;
  readonly name: string;
  readonly timeType: TimeType;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly teamIds: readonly string[];
}

export interface PlanSeed {
  readonly id: string;
  readonly serviceTypeId: string;
  readonly day: string;
  readonly title: string;
  readonly seriesTitle: string | null;
  readonly seriesId: string | null;
  readonly createdAt: Date;
  readonly sortDate: Date;
  readonly times: readonly TimeSeed[];
  /** Lineup, run sheet, and times fixtures exist for it. */
  readonly detailed: boolean;
  /** Its lineup feeds history and serving rhythms. */
  readonly scheduled: boolean;
}

/** The plan screenshots, previews, and UI tests open first. */
export const SHOWCASE_PLAN_ID = `881${compactDay(ANCHOR_SUNDAY)}`;

/** Plans before this day have no lineup, run sheet, or times fixtures. */
const DETAILED_FROM = "2026-08-30";
/** Lineups start here, early enough for 180-day serving rhythms. */
const SCHEDULED_FROM = "2026-04-01";

interface SeriesSeed {
  readonly id: string | null;
  readonly title: string | null;
  readonly titles: readonly string[];
}

const sundaySeries: readonly SeriesSeed[] = [
  {
    id: "77001",
    title: "Known",
    titles: [
      "Known by Name",
      "Known in Weakness",
      "Known in Doubt",
      "Known in Grief",
      "Known in Joy",
      "Known in Community",
      "Fully Known",
    ],
  },
  { id: null, title: null, titles: ["Thanksgiving Sunday"] },
  {
    id: "77002",
    title: "Advent: Come, Light",
    titles: ["Hope", "Peace", "Joy", "Love"],
  },
  { id: null, title: null, titles: ["Stories of the Year"] },
  {
    id: "77003",
    title: "Sermon on the Mount",
    titles: [
      "Blessed",
      "Salt and Light",
      "Fulfilled",
      "Anger and Reconciliation",
      "Let Your Yes Be Yes",
      "Love Your Enemies",
      "Giving in Secret",
      "How to Pray",
      "Fasting",
      "Treasure",
      "Do Not Worry",
      "The Log and the Speck",
      "Two Foundations",
    ],
  },
  { id: null, title: null, titles: ["Easter Sunday"] },
  {
    id: "77004",
    title: "Acts: The Church in Motion",
    titles: [
      "Wait for the Gift",
      "Wind and Fire",
      "Devoted",
      "The Beautiful Gate",
      "Bold",
      "Shared Life",
      "Stephen",
      "The Road to Gaza",
      "Damascus Road",
      "Peter's Vision",
      "Antioch",
      "Open Prison",
    ],
  },
  {
    id: "77005",
    title: "Psalms for the Road",
    titles: [
      "Two Paths",
      "The Shepherd",
      "Be Still",
      "A Clean Heart",
      "Number Our Days",
      "Where Help Comes From",
      "Searched and Known",
      "Everything That Breathes",
    ],
  },
  {
    id: "77006",
    title: "Rooted",
    titles: [
      "Planted",
      "Good Soil",
      "Through Dry Seasons",
      "Branches",
      "Fruit That Lasts",
      "Deep Roots",
      "Rooted Together",
    ],
  },
  {
    id: "77007",
    title: "Open Table",
    titles: [
      "A Seat for Everyone",
      "Bread for the Journey",
      "Strangers and Neighbors",
      "The Long Table",
      "Leftovers",
    ],
  },
  { id: null, title: null, titles: ["Thanksgiving Sunday"] },
  { id: "77008", title: "Advent: Waiting", titles: ["Hope in the Dark"] },
];

const youthSeries: readonly SeriesSeed[] = [
  {
    id: "77101",
    title: "Real Talk",
    titles: [
      "Friendship",
      "Anxiety",
      "Phones",
      "Family",
      "Failure",
      "Purpose",
      "Courage",
    ],
  },
  {
    id: "77102",
    title: "Parables",
    titles: [
      "The Lost Sheep",
      "The Lost Coin",
      "The Lost Son",
      "The Sower",
      "The Mustard Seed",
      "The Good Samaritan",
      "The Two Builders",
      "The Talents",
      "The Wedding Feast",
      "The Pearl",
      "The Unforgiving Servant",
      "The Persistent Widow",
      "The Rich Fool",
      "The Two Sons",
      "The Lamp",
    ],
  },
  {
    id: "77103",
    title: "Back to Basics",
    titles: ["Who Is Jesus?", "Why Church?", "Prayer 101", "Reading the Bible"],
  },
  {
    id: "77104",
    title: "Questions",
    titles: [
      "Is God Real?",
      "Is God Good?",
      "Why Does It Hurt?",
      "Can I Start Over?",
      "Does Prayer Work?",
      "Who Am I?",
    ],
  },
  { id: null, title: null, titles: ["Game Night"] },
  { id: "77105", title: "Thankful", titles: ["Gratitude Changes Things"] },
];

const sundayTimes = (planId: string, day: string): TimeSeed[] => [
  {
    id: `${planId}1`,
    name: "Rehearsal",
    timeType: "rehearsal",
    startsAt: at(addDays(day, -3), "19:00"),
    endsAt: at(addDays(day, -3), "20:30"),
    teamIds: [T.band, T.vocals],
  },
  {
    id: `${planId}2`,
    name: "9 AM Gathering",
    timeType: "service",
    startsAt: at(day, "09:00"),
    endsAt: at(day, "10:15"),
    teamIds: [T.band, T.vocals, T.production, T.hospitality],
  },
  {
    id: `${planId}3`,
    name: "11 AM Gathering",
    timeType: "service",
    startsAt: at(day, "11:00"),
    endsAt: at(day, "12:15"),
    teamIds: [T.band, T.vocals, T.production, T.hospitality],
  },
];

const youthTimes = (planId: string, day: string): TimeSeed[] => [
  {
    id: `${planId}1`,
    name: "Soundcheck",
    timeType: "rehearsal",
    startsAt: at(day, "18:00"),
    endsAt: at(day, "18:45"),
    teamIds: [T.youthBand],
  },
  {
    id: `${planId}2`,
    name: "Youth Night",
    timeType: "service",
    startsAt: at(day, "19:00"),
    endsAt: at(day, "20:30"),
    teamIds: [T.youthBand, T.youthTech],
  },
];

const eventTimes = (
  planId: string,
  day: string,
  rehearsal: string,
  service: string,
  serviceEnd: string
): TimeSeed[] => [
  {
    id: `${planId}1`,
    name: "Run-through",
    timeType: "rehearsal",
    startsAt: at(day, rehearsal),
    endsAt: at(day, service),
    teamIds: [T.eventBand, T.eventVocals, T.eventProduction],
  },
  {
    id: `${planId}2`,
    name: "",
    timeType: "service",
    startsAt: at(day, service),
    endsAt: at(day, serviceEnd),
    teamIds: [T.eventBand, T.eventVocals, T.eventProduction],
  },
];

const createPlan = (
  prefix: string,
  serviceTypeId: string,
  day: string,
  series: Pick<SeriesSeed, "id" | "title">,
  title: string,
  times: readonly TimeSeed[]
): PlanSeed => {
  const firstService = times.find(({ timeType }) => timeType === "service");
  const sortDate = firstService?.startsAt ?? at(day, "09:00");
  return {
    id: `${prefix}${compactDay(day)}`,
    serviceTypeId,
    day,
    title,
    seriesTitle: series.title,
    seriesId: series.id,
    createdAt: at(addDays(day, -70), "11:22"),
    sortDate,
    times,
    detailed: day >= DETAILED_FROM,
    scheduled: day >= SCHEDULED_FROM,
  };
};

const plansFromSeries = (
  prefix: string,
  serviceTypeId: string,
  days: readonly string[],
  series: readonly SeriesSeed[],
  timesFor: (planId: string, day: string) => TimeSeed[]
): PlanSeed[] => {
  const titles = series.flatMap((entry) =>
    entry.titles.map((title) => ({ entry, title }))
  );
  if (titles.length !== days.length) {
    throw new Error(
      `${serviceTypeId} has ${days.length} plans but ${titles.length} titles`
    );
  }
  return days.map((day, index) => {
    const { entry, title } = titles[index] ?? { entry: series[0], title: "" };
    const planId = `${prefix}${compactDay(day)}`;
    return createPlan(
      prefix,
      serviceTypeId,
      day,
      entry ?? { id: null, title: null },
      title,
      timesFor(planId, day)
    );
  });
};

const sundayPlans = plansFromSeries(
  "881",
  SUNDAY,
  daysEvery("2025-10-05", "2026-11-29", 7),
  sundaySeries,
  sundayTimes
);

/** Youth Night meets on Wednesdays, with a summer break. */
const youthDays = daysEvery("2026-01-07", "2026-11-18", 7).filter(
  (day) => day < "2026-06-10" || day > "2026-08-26"
);

const youthPlans = plansFromSeries(
  "882",
  YOUTH,
  youthDays,
  youthSeries,
  youthTimes
);

const noSeries = { id: null, title: null };

const eventPlans: PlanSeed[] = [
  createPlan(
    "883",
    EVENTS,
    "2025-12-24",
    noSeries,
    "Christmas Eve Candlelight",
    eventTimes("883251224", "2025-12-24", "15:00", "17:00", "18:00")
  ),
  createPlan(
    "883",
    EVENTS,
    "2026-08-23",
    noSeries,
    "Back to School Blessing",
    eventTimes("883260823", "2026-08-23", "16:30", "18:00", "19:15")
  ),
  createPlan(
    "883",
    EVENTS,
    "2026-10-18",
    { id: "77201", title: "Baptism" },
    "Baptism Night",
    eventTimes("883261018", "2026-10-18", "16:30", "18:00", "19:30")
  ),
  createPlan(
    "883",
    EVENTS,
    "2026-11-06",
    noSeries,
    "Night of Worship",
    eventTimes("883261106", "2026-11-06", "17:30", "19:00", "21:00")
  ),
  createPlan(
    "883",
    EVENTS,
    "2026-11-25",
    noSeries,
    "Thanksgiving Eve",
    eventTimes("883261125", "2026-11-25", "17:45", "19:00", "20:15")
  ),
];

/** Every plan, in date order. */
export const plans: readonly PlanSeed[] = [
  ...sundayPlans,
  ...youthPlans,
  ...eventPlans,
].toSorted((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

export const planById = (planId: string): PlanSeed => {
  const found = plans.find(({ id }) => id === planId);
  if (found === undefined) {
    throw new Error(`Unknown plan ${planId}`);
  }
  return found;
};

export const plansFor = (serviceTypeId: string): readonly PlanSeed[] =>
  plans.filter((plan) => plan.serviceTypeId === serviceTypeId);

export const isUpcoming = (plan: PlanSeed): boolean => plan.day >= ANCHOR_TODAY;

export const serviceTimes = (plan: PlanSeed): readonly TimeSeed[] =>
  plan.times.filter(({ timeType }) => timeType === "service");

export const planUrl = (plan: PlanSeed): string =>
  `https://services.planningcenteronline.com/plans/${plan.id}`;

// Lineups

export type StatusCode = "C" | "U" | "D";

export interface NotificationSeed {
  readonly prepared: boolean;
  readonly sentAt: string | null;
  readonly senderName: string | null;
}

export interface AssignmentSeed {
  readonly planPersonId: string;
  readonly plan: PlanSeed;
  readonly person: PersonSeed;
  readonly team: TeamSeed;
  readonly positionId: string;
  readonly positionName: string;
  readonly source: "team_position" | "plan_member";
  readonly status: StatusCode;
  readonly declineReason: string | null;
  readonly notification: NotificationSeed;
  readonly createdAt: Date;
  readonly timeIds: readonly string[];
  readonly serviceTimeIds: readonly string[];
}

interface ExplicitAssignment {
  readonly day: string;
  readonly serviceTypeId?: string;
  readonly positionId: string;
  readonly personId: string;
  readonly status: StatusCode;
  readonly declineReason?: string;
  readonly unsent?: boolean;
}

/** The showcase lineup: every status, unsent emails, open slots, and a decline. */
const explicitAssignments: readonly ExplicitAssignment[] = [
  {
    day: ANCHOR_SUNDAY,
    positionId: P.acoustic,
    personId: "4100104",
    status: "C",
  },
  { day: ANCHOR_SUNDAY, positionId: P.bass, personId: "4100107", status: "C" },
  { day: ANCHOR_SUNDAY, positionId: P.drums, personId: "4100108", status: "U" },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.electric,
    personId: "4100111",
    status: "D",
    declineReason: "Traveling for a family wedding that weekend.",
  },
  { day: ANCHOR_SUNDAY, positionId: P.keys, personId: "4100112", status: "C" },
  { day: ANCHOR_SUNDAY, positionId: P.lead, personId: VIEWER_ID, status: "C" },
  { day: ANCHOR_SUNDAY, positionId: P.alto, personId: "4100116", status: "C" },
  { day: ANCHOR_SUNDAY, positionId: P.sound, personId: "4100122", status: "C" },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.lyrics,
    personId: "4100124",
    status: "U",
    unsent: true,
  },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.camera,
    personId: "4100125",
    status: "C",
  },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.camera,
    personId: "4100126",
    status: "C",
  },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.livestream,
    personId: "4100127",
    status: "C",
  },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.coffee,
    personId: "4100128",
    status: "C",
  },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.coffee,
    personId: "4100129",
    status: "U",
    unsent: true,
  },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.greeter,
    personId: "4100131",
    status: "C",
  },
  {
    day: ANCHOR_SUNDAY,
    positionId: P.greeter,
    personId: "4100132",
    status: "U",
    unsent: true,
  },
  // Avery has been declining lately.
  {
    day: "2026-07-12",
    positionId: P.electric,
    personId: "4100111",
    status: "D",
  },
  {
    day: "2026-08-02",
    positionId: P.electric,
    personId: "4100111",
    status: "D",
    declineReason: "Working that weekend",
  },
  {
    day: "2026-09-13",
    positionId: P.electric,
    personId: "4100111",
    status: "D",
    declineReason: "Out of town",
  },
  {
    day: "2026-08-30",
    positionId: P.electric,
    personId: "4100110",
    status: "D",
    declineReason: "Feeling sick",
  },
  // Who leads worship in the coming weeks.
  { day: "2026-10-11", positionId: P.lead, personId: "4100121", status: "C" },
  { day: "2026-10-11", positionId: P.alto, personId: "4100104", status: "C" },
  { day: "2026-10-18", positionId: P.lead, personId: VIEWER_ID, status: "C" },
  {
    day: "2026-10-18",
    positionId: P.acoustic,
    personId: "4100102",
    status: "D",
    declineReason: "Visiting family that weekend",
  },
  { day: "2026-10-25", positionId: P.lead, personId: "4100115", status: "U" },
  { day: "2026-11-01", positionId: P.lead, personId: VIEWER_ID, status: "U" },
  {
    day: "2026-10-18",
    serviceTypeId: EVENTS,
    positionId: P.eventLead,
    personId: VIEWER_ID,
    status: "C",
  },
];

const DAYS_PER_WEEK = 7;

/** Weeks from the anchor's "today" to a plan, rounded up: this week's plans are 1 out. */
const weeksOutFor = (plan: PlanSeed): number =>
  Math.max(0, Math.ceil(daysBetween(ANCHOR_TODAY, plan.day) / DAYS_PER_WEEK));

const pickShare = (shares: readonly number[], weeksOut: number): number =>
  shares[Math.min(weeksOut, shares.length - 1)] ?? 0;

/** Share of a future plan's slots already filled, by weeks out. */
const fillShare = (serviceTypeId: string, weeksOut: number): number =>
  serviceTypeId === EVENTS
    ? Math.max(0.3, 1 - weeksOut * 0.08)
    : pickShare([1, 0.92, 0.8, 0.65, 0.5, 0.38, 0.27, 0.17, 0.1], weeksOut);

/** Chance a future assignment is already confirmed, by weeks out. */
const confirmedShare = (weeksOut: number): number =>
  pickShare([1, 0.8, 0.65, 0.45, 0.3, 0.2], weeksOut);

/** Chance a pending assignment's email is still unsent, by weeks out. */
const unsentShare = (weeksOut: number): number =>
  pickShare([0, 0, 0, 0.4, 0.65], weeksOut);

const iso = (instant: Date) => instant.toISOString();

const notificationFor = (
  plan: PlanSeed,
  status: StatusCode,
  weeksOut: number,
  seed: string,
  forceUnsent: boolean
): NotificationSeed => {
  if (
    forceUnsent ||
    (status === "U" && unit(`${seed}:email`) < unsentShare(weeksOut))
  ) {
    return { prepared: true, sentAt: null, senderName: null };
  }
  const daysBefore = status === "C" ? 18 + Math.floor(unit(seed) * 10) : 9;
  const sentAt = addHours(minusDays(plan.sortDate, daysBefore), 3);
  return {
    prepared: false,
    sentAt: iso(sentAt > ANCHOR_NOW ? minusDays(ANCHOR_NOW, 2) : sentAt),
    senderName,
  };
};

const assignmentTimes = (plan: PlanSeed, team: TeamSeed) => {
  const timeIds = plan.times
    .filter(({ teamIds }) => teamIds.includes(team.id))
    .map(({ id }) => id);
  const serviceTimeIds = serviceTimes(plan)
    .filter(({ teamIds }) => teamIds.includes(team.id))
    .map(({ id }) => id);
  return { timeIds, serviceTimeIds };
};

const lastServed = new Map<string, string>();

/** Whether the rotation may put someone on a plan they have no row on yet. */
const isEligible = (
  seed: PersonSeed,
  plan: PlanSeed,
  onPlan: ReadonlySet<string>
): boolean =>
  seed.away !== true &&
  seed.onlyWhenAsked !== true &&
  (seed.servedUntil === undefined || plan.day <= seed.servedUntil) &&
  !onPlan.has(seed.id) &&
  !isBlockedOn(seed, plan.day);

/**
 * Days volunteers rest between plans, unless a slot would go empty: adults served about every
 * third week, students every other week, and upcoming plans ask everyone every other week.
 */
const restDays = (plan: PlanSeed): number =>
  plan.serviceTypeId === YOUTH || isUpcoming(plan) ? 13 : 20;
/** Chance a slot nobody rested can take is filled by someone serving again early. */
const STRETCH_SHARE = 0.3;

const hasRested = (seed: PersonSeed, plan: PlanSeed): boolean => {
  const last = lastServed.get(seed.id);
  return last === undefined || daysBetween(last, plan.day) > restDays(plan);
};

const pickFromRotation = (
  plan: PlanSeed,
  position: PositionSeed,
  onPlan: ReadonlySet<string>,
  seedKey: string
): PersonSeed | undefined => {
  const eligible = rosterFor(position.id).filter((seed) =>
    isEligible(seed, plan, onPlan)
  );
  const rested = eligible.filter((seed) => hasRested(seed, plan));
  const pool =
    rested.length > 0 || unit(`${seedKey}:stretch`) >= STRETCH_SHARE
      ? rested
      : eligible;
  return pool.toSorted((a, b) => {
    const byLastServed = (lastServed.get(a.id) ?? "").localeCompare(
      lastServed.get(b.id) ?? ""
    );
    return byLastServed === 0
      ? unit(`${plan.id}:${a.id}`) - unit(`${plan.id}:${b.id}`)
      : byLastServed;
  })[0];
};

/** Marketing replica history: who served each of the 11 Sundays before the anchor. */
const replicaServed = (plan: PlanSeed, positionId: string): PersonSeed[] => {
  if (plan.serviceTypeId !== SUNDAY) {
    return [];
  }
  const weeksAgo = -weeksFromAnchor(plan.day);
  if (weeksAgo < 1) {
    return [];
  }
  return rosterFor(positionId).filter((seed) =>
    (seed.served ?? []).some(
      (entry) => entry.weeksAgo === weeksAgo && entry.position === positionId
    )
  );
};

const buildLineups = (): AssignmentSeed[] => {
  const assignments: AssignmentSeed[] = [];
  for (const plan of plans.filter(({ scheduled }) => scheduled)) {
    const weeksOut = weeksOutFor(plan);
    const isPast = plan.day < ANCHOR_TODAY;
    const isShowcase = plan.id === SHOWCASE_PLAN_ID;
    /** Everyone with a row on the plan, declines included. */
    const onPlan = new Set<string>();
    /** Everyone serving it. */
    const serving = new Set<string>();
    let index = 0;
    const add = (
      seed: PersonSeed,
      team: TeamSeed,
      position: PositionSeed,
      status: StatusCode,
      extra: { declineReason?: string; unsent?: boolean } = {}
    ) => {
      index += 1;
      const planPersonId = `${plan.id}${String(index).padStart(3, "0")}`;
      const notification = notificationFor(
        plan,
        status,
        weeksOut,
        planPersonId,
        extra.unsent === true
      );
      assignments.push({
        planPersonId,
        plan,
        person: seed,
        team,
        positionId: position.id,
        positionName: position.name,
        source: "team_position",
        status,
        declineReason: extra.declineReason ?? null,
        notification,
        createdAt: minusDays(
          notification.sentAt === null
            ? ANCHOR_NOW
            : new Date(notification.sentAt),
          notification.sentAt === null ? 3 : 0.1
        ),
        ...assignmentTimes(plan, team),
      });
      onPlan.add(seed.id);
      if (status !== "D") {
        serving.add(seed.id);
      }
    };

    for (const team of teamsFor(plan.serviceTypeId)) {
      for (const position of team.positions) {
        const explicit = explicitAssignments.filter(
          (entry) =>
            entry.day === plan.day &&
            entry.positionId === position.id &&
            (entry.serviceTypeId ?? SUNDAY) === plan.serviceTypeId
        );
        for (const entry of explicit) {
          add(personById(entry.personId), team, position, entry.status, {
            declineReason: entry.declineReason,
            unsent: entry.unsent,
          });
        }
        for (const seed of replicaServed(plan, position.id)) {
          if (!onPlan.has(seed.id)) {
            add(seed, team, position, "C");
          }
        }
        if (isShowcase) {
          continue;
        }
        const filled = assignments.filter(
          (entry) =>
            entry.plan === plan &&
            entry.positionId === position.id &&
            entry.status !== "D"
        ).length;
        for (let slot = filled; slot < position.slots; slot += 1) {
          const seedKey = `${plan.id}:${position.id}:${slot}`;
          if (
            !isPast &&
            unit(seedKey) >= fillShare(plan.serviceTypeId, weeksOut)
          ) {
            continue;
          }
          const pick = pickFromRotation(plan, position, onPlan, seedKey);
          if (pick === undefined) {
            continue;
          }
          const status =
            isPast || unit(`${seedKey}:status`) < confirmedShare(weeksOut)
              ? "C"
              : "U";
          add(pick, team, position, status);
        }
      }
    }
    for (const id of serving) {
      lastServed.set(id, plan.day);
    }
  }
  return assignments;
};

/** Every plan person on every scheduled plan, declines included. */
export const assignments: readonly AssignmentSeed[] = buildLineups();

/** Showcase-only slots: a plan member on a position the team doesn't list, and an open slot no team position matches. */
export const STAGE_MANAGER = {
  planId: SHOWCASE_PLAN_ID,
  teamId: T.production,
  name: "Stage Manager",
  personId: "4100123",
  planPersonId: `${SHOWCASE_PLAN_ID}090`,
} as const;

export const USHER = {
  planId: SHOWCASE_PLAN_ID,
  teamId: T.hospitality,
  name: "Usher",
  neededPositionId: "93261004",
  openCount: 1,
} as const;

const stageManagerAssignment = (): AssignmentSeed => {
  const plan = planById(STAGE_MANAGER.planId);
  const team = teamsFor(SUNDAY).find(({ id }) => id === STAGE_MANAGER.teamId);
  if (team === undefined) {
    throw new Error("Missing production team");
  }
  return {
    planPersonId: STAGE_MANAGER.planPersonId,
    plan,
    person: personById(STAGE_MANAGER.personId),
    team,
    positionId: `plan-member-position:${team.id}:${encodeURIComponent(STAGE_MANAGER.name.toLowerCase())}`,
    positionName: STAGE_MANAGER.name,
    source: "plan_member",
    status: "C",
    declineReason: null,
    notification: { prepared: false, sentAt: null, senderName: null },
    createdAt: minusDays(ANCHOR_NOW, 5),
    ...assignmentTimes(plan, team),
  };
};

export const allAssignments: readonly AssignmentSeed[] = [
  ...assignments,
  stageManagerAssignment(),
];

export const assignmentsFor = (planId: string): readonly AssignmentSeed[] =>
  allAssignments.filter(({ plan }) => plan.id === planId);

export const assignmentsOf = (personId: string): readonly AssignmentSeed[] =>
  allAssignments.filter(({ person }) => person.id === personId);

/** Open slots still requested for a position; past plans keep none. */
export const openSlots = (plan: PlanSeed, position: PositionSeed): number => {
  if (!isUpcoming(plan)) {
    return 0;
  }
  const filled = allAssignments.filter(
    (entry) =>
      entry.plan === plan &&
      entry.positionId === position.id &&
      entry.status !== "D"
  ).length;
  return Math.max(0, position.slots - filled);
};

// Songs on plans

export interface SongUse {
  readonly plan: PlanSeed;
  readonly song: SongSeed;
  readonly arrangement: ArrangementSeed;
  readonly key: KeySeed | null;
  readonly notes: string;
}

interface ExplicitSong {
  readonly title: string;
  readonly key?: string;
  readonly notes?: string;
  /** Planned with no key yet. */
  readonly noKey?: boolean;
}

const explicitSundaySets: ReadonlyMap<string, readonly ExplicitSong[]> =
  new Map([
    [
      "2026-02-22",
      [
        { title: "Gathered Here" },
        { title: "Hallelujah Road" },
        { title: "Evergreen" },
        { title: "Here With Us" },
      ],
    ],
    [
      "2026-09-13",
      [
        { title: "Wide as the Sky" },
        { title: "Lanterns" },
        { title: "Evergreen" },
        { title: "Harbor of Mercy" },
      ],
    ],
    [
      "2026-09-20",
      [
        { title: "Gathered Here" },
        { title: "Steady Ground" },
        { title: "Kingdom Come Slowly" },
        { title: "Every Breath" },
      ],
    ],
    [
      "2026-09-27",
      [
        { title: "All the Way Home" },
        { title: "Shepherd of My Days" },
        { title: "Unshaken" },
        { title: "Benediction Song" },
      ],
    ],
    [
      ANCHOR_SUNDAY,
      [
        { title: "Morning Light", key: "G", notes: "Full band" },
        { title: "Steady Ground", key: "D", notes: "Acoustic intro" },
        { title: "Open Doors", key: "A", notes: "Key change after bridge" },
        { title: "Here With Us", key: "E", notes: "Keys only" },
      ],
    ],
    [
      "2026-10-11",
      [
        { title: "Glory Rising", notes: "Start with drums and bass" },
        { title: "Lanterns" },
        { title: "Still Small Voice", noKey: true },
        { title: "Evergreen", notes: "Morgan sings verse 2" },
      ],
    ],
    [
      "2026-10-18",
      [
        { title: "Open Doors" },
        { title: "Table of Plenty" },
        { title: "Wide as the Sky" },
        { title: "Here With Us" },
      ],
    ],
    ["2026-11-22", [{ title: "Thankful Heart" }, { title: "Table of Plenty" }]],
    ["2026-11-29", []],
  ]);

const seasonalSets: readonly {
  readonly days: readonly string[];
  readonly titles: readonly string[];
}[] = [
  {
    days: ["2025-11-23"],
    titles: ["Thankful Heart", "Table of Plenty"],
  },
  {
    days: ["2025-11-30", "2025-12-07", "2025-12-14", "2025-12-21"],
    titles: ["Light the Way", "Waiting Season"],
  },
  { days: ["2026-04-05"], titles: ["Bright City", "Glory Rising"] },
];

const SONGS_PER_SUNDAY = 4;
const MIN_WEEKS_BETWEEN_PLAYS = 2;

const resolveKey = (
  plan: PlanSeed,
  song: SongSeed,
  arrangement: ArrangementSeed,
  explicit: ExplicitSong | undefined
): KeySeed | null => {
  if (explicit?.noKey === true) {
    return null;
  }
  if (explicit?.key !== undefined) {
    return (
      arrangement.keys.find(
        ({ startingKey }) => startingKey === explicit.key
      ) ?? null
    );
  }
  const [first, second] = arrangement.keys;
  return second !== undefined && unit(`${plan.id}:${song.id}:key`) < 0.25
    ? second
    : (first ?? null);
};

const songUseFor = (plan: PlanSeed, explicit: ExplicitSong): SongUse => {
  const song = songByTitle(explicit.title);
  const arrangement = liveArrangement(song);
  return {
    plan,
    song,
    arrangement,
    key: resolveKey(plan, song, arrangement, explicit),
    notes: explicit.notes ?? "",
  };
};

interface RotationCandidate {
  readonly seed: SongSeed;
  readonly weeksSince: number;
}

/** How overdue a song is for its usual rotation; above 1 means past due. */
const rotationDue = ({ seed, weeksSince }: RotationCandidate): number =>
  weeksSince / (seed.rotationWeeks ?? 1);

const buildSundaySongs = (): SongUse[] => {
  const uses: SongUse[] = [];
  const lastPlayed = new Map<string, string>();
  const rotation = songs.filter(
    (seed) => seed.rotationWeeks !== undefined && !seed.hidden
  );
  for (const plan of plansFor(SUNDAY)) {
    const explicit = explicitSundaySets.get(plan.day);
    const seasonal =
      seasonalSets
        .find(({ days }) => days.includes(plan.day))
        ?.titles.map((title) => ({ title })) ?? [];
    const chosen: ExplicitSong[] =
      explicit === undefined ? [...seasonal] : [...explicit];
    if (explicit === undefined) {
      const ranked = rotation
        .filter((seed) => !chosen.some(({ title }) => title === seed.title))
        .map((seed) => {
          const last = lastPlayed.get(seed.id);
          const weeksSince =
            last === undefined
              ? Number.POSITIVE_INFINITY
              : weeksFromAnchor(plan.day) - weeksFromAnchor(last);
          return { seed, weeksSince };
        })
        .filter(({ weeksSince }) => weeksSince >= MIN_WEEKS_BETWEEN_PLAYS)
        .toSorted(
          (a, b) =>
            rotationDue(b) - rotationDue(a) ||
            unit(`${plan.id}:${a.seed.id}`) - unit(`${plan.id}:${b.seed.id}`)
        );
      for (const { seed } of ranked.slice(
        0,
        SONGS_PER_SUNDAY - chosen.length
      )) {
        chosen.push({ title: seed.title });
      }
    }
    for (const entry of chosen) {
      const songUse = songUseFor(plan, entry);
      uses.push(songUse);
      lastPlayed.set(songUse.song.id, plan.day);
    }
  }
  return uses;
};

const youthRotation = [
  "Brighter",
  "Undivided",
  "Glory Rising",
  "Every Breath",
  "Bright City",
  "All the Way Home",
  "Unshaken",
] as const;

const buildYouthSongs = (): SongUse[] =>
  plansFor(YOUTH).flatMap((plan, index) =>
    [0, 1, 2].map((offset) =>
      songUseFor(plan, {
        title:
          youthRotation[(index * 2 + offset) % youthRotation.length] ??
          "Brighter",
      })
    )
  );

const eventSets: ReadonlyMap<string, readonly string[]> = new Map([
  [
    "2025-12-24",
    ["Light the Way", "Waiting Season", "Here With Us", "Benediction Song"],
  ],
  ["2026-08-23", ["All the Way Home", "Bright City", "Benediction Song"]],
  [
    "2026-10-18",
    [
      "River Song",
      "Open Doors",
      "Here With Us",
      "Glory Rising",
      "Benediction Song",
    ],
  ],
  [
    "2026-11-06",
    [
      "Every Breath",
      "Still Small Voice",
      "Morning Light",
      "Kingdom Come Slowly",
      "Wide as the Sky",
      "Unshaken",
    ],
  ],
  ["2026-11-25", ["Thankful Heart", "Table of Plenty", "Harbor of Mercy"]],
]);

const buildEventSongs = (): SongUse[] =>
  plansFor(EVENTS).flatMap((plan) =>
    (eventSets.get(plan.day) ?? []).map((title) => songUseFor(plan, { title }))
  );

export const songUses: readonly SongUse[] = [
  ...buildSundaySongs(),
  ...buildYouthSongs(),
  ...buildEventSongs(),
].toSorted((a, b) => a.plan.sortDate.getTime() - b.plan.sortDate.getTime());

export const songUsesFor = (planId: string): readonly SongUse[] =>
  songUses.filter(({ plan }) => plan.id === planId);

/** Planning Center's `last_scheduled_at`, as of the anchor: the latest plan up to now. */
export const lastScheduledAt = (songId: string): Date | null => {
  const played = songUses.filter(
    ({ song, plan }) => song.id === songId && plan.sortDate <= ANCHOR_NOW
  );
  const latest = played.at(-1)?.plan.sortDate;
  if (latest !== undefined) {
    return latest;
  }
  return songById(songId).lastScheduledBefore ?? null;
};
