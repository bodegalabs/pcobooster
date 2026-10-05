import type { ScheduleItem } from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import {
  buildPersonMonthDays,
  getMonthInfo,
  getMostCommonRoles,
  initialsFromName,
  itemsInMonth,
} from "@pcobooster/api/modules/planning-center/get-people-dashboard";
import { buildServingRhythm } from "@pcobooster/api/modules/planning-center/serving-rhythm";
import { PROGRESSIVE_REQUEST_BUDGET } from "@pcobooster/api/planning-center/request-budget";
import { blockoutCoversPlanSortInstant } from "@pcobooster/planning-center-models/calendar-day";

import type {
  FilledPositionPerson,
  Plan,
  TeamPosition,
  TeamPositionGroup,
} from "../../../packages/contracts/src/catalog";
import type {
  ChordChartArrangement,
  ChordChartSongOutput,
} from "../../../packages/contracts/src/chord-charts";
import type {
  Blockout,
  CandidateDetailsBatch,
  PeopleDashboardActivity,
  PeopleDashboardPersonDetail,
  PeopleDashboardRosterPerson,
  PlanWindowHistoryBatch,
  PositionCandidates,
} from "../../../packages/contracts/src/people-schemas";
import type { PlanItem } from "../../../packages/contracts/src/plan-item-schemas";
import type { PlanTime } from "../../../packages/contracts/src/plan-time-schemas";
import type {
  ArrangementOption,
  KeyOption,
  SongCatalogEntry,
  SongOptionSet,
} from "../../../packages/contracts/src/song-schemas";
import type { SongHistoryEntry } from "../../../packages/contracts/src/songs";
import type { AppFixtures } from "./fixture-file";
import {
  EVENTS,
  SUNDAY,
  VIEWER_ID,
  YOUTH,
  blockoutWindows,
  fullName,
  organization,
  otherAccount,
  people,
  personById,
  positionRefs,
  preacherName,
  rosterFor,
  serviceTypeName,
  serviceTypes,
  teams,
  teamsFor,
  viewerEmail,
} from "./organization";
import type {
  PersonSeed,
  PositionRef,
  PositionSeed,
  TeamSeed,
} from "./organization";
import { chordChartPdf } from "./pdf";
import {
  SHOWCASE_PLAN_ID,
  STAGE_MANAGER,
  USHER,
  allAssignments,
  assignmentsFor,
  assignmentsOf,
  isUpcoming,
  lastScheduledAt,
  openSlots,
  planById,
  planUrl,
  plans,
  plansFor,
  songUses,
  songUsesFor,
} from "./plans";
import type { AssignmentSeed, PlanSeed, SongUse, StatusCode } from "./plans";
import {
  SHOWCASE_SONG_ID,
  liveArrangement,
  lyricsFromChart,
  songById,
  songLayouts,
  songs,
} from "./songs";
import type { ArrangementSeed, KeySeed, SongSeed } from "./songs";
import {
  ANCHOR_NOW,
  ANCHOR_SUNDAY,
  ORG_TIME_ZONE,
  at,
  daysBetween,
  minusDays,
} from "./time";

/** The showcase person: an acoustic player carrying a heavy load. */
export const SHOWCASE_PERSON_ID = "4100104";
/** The Youth Night and special event in the showcase week, with their own windows. */
const SHOWCASE_YOUTH_PLAN_ID = "882261007";
const SHOWCASE_EVENT_PLAN_ID = "883261018";

const GENERATED_AT = ANCHOR_NOW.toISOString();
const iso = (instant: Date) => instant.toISOString();
const byName = (a: string, b: string) => a.localeCompare(b);
const byLastName = (a: PersonSeed, b: PersonSeed) =>
  byName(a.lastName, b.lastName) || byName(a.firstName, b.firstName);

const detailedPlans = plans.filter(({ detailed }) => detailed);

// Catalog

const planOutput = (plan: PlanSeed): Plan => {
  const output: Plan = {
    id: plan.id,
    title: plan.title,
    seriesId: plan.seriesId,
    planningCenterUrl: planUrl(plan),
    createdAt: plan.createdAt,
    sortDate: plan.sortDate,
  };
  // Planning Center leaves the series title out for plans in no series.
  if (plan.seriesTitle !== null) {
    output.seriesTitle = plan.seriesTitle;
  }
  return output;
};

const filledPerson = (entry: AssignmentSeed): FilledPositionPerson => ({
  id: entry.person.id,
  planPersonId: entry.planPersonId,
  personId: entry.person.id,
  name: fullName(entry.person),
  status: entry.status === "C" ? "confirmed" : "pending",
  rawStatus: entry.status,
  photoThumbnailUrl: null,
  assignedTimeIds: [...entry.timeIds],
  serviceTimeIds: [...entry.serviceTimeIds],
  notification: { ...entry.notification },
});

/** Confirmed people first, then by name, as the API sorts a position's people. */
const byStatusThenName = (a: FilledPositionPerson, b: FilledPositionPerson) => {
  if (a.status === b.status) {
    return byName(a.name, b.name);
  }
  return a.status === "confirmed" ? -1 : 1;
};

/** Adds the filled counts and people the API sets only when someone fills the position. */
const addFilled = (
  position: TeamPosition,
  entries: readonly AssignmentSeed[]
): TeamPosition => {
  const filled = entries.map(filledPerson).toSorted(byStatusThenName);
  const confirmed = filled.filter(
    ({ status }) => status === "confirmed"
  ).length;
  const pending = filled.length - confirmed;
  if (confirmed > 0) {
    position.filledConfirmedCount = confirmed;
  }
  if (pending > 0) {
    position.filledPendingCount = pending;
  }
  if (filled.length > 0) {
    position.filledPeople = filled;
  }
  return position;
};

const neededPositionId = (plan: PlanSeed, position: PositionSeed) =>
  `9${plan.id.slice(3)}${position.id.slice(-2)}`;

const teamPosition = (
  plan: PlanSeed,
  team: TeamSeed,
  position: PositionSeed
): TeamPosition | null => {
  const filled = assignmentsFor(plan.id).filter(
    (entry) => entry.positionId === position.id && entry.status !== "D"
  );
  const open = openSlots(plan, position);
  if (filled.length === 0 && open === 0) {
    return null;
  }
  const row: TeamPosition = {
    id: position.id,
    name: position.name,
    teamId: team.id,
    teamName: team.name,
    source: "team_position",
    neededCount: open,
  };
  // Only a position with open slots has a needed-position record.
  if (open > 0) {
    row.neededPositionId = neededPositionId(plan, position);
    row.timeId = null;
    row.timePreferenceOptionId = null;
  }
  return addFilled(row, filled);
};

const showcaseExtras = (plan: PlanSeed, team: TeamSeed): TeamPosition[] => {
  if (plan.id !== SHOWCASE_PLAN_ID) {
    return [];
  }
  if (team.id === STAGE_MANAGER.teamId) {
    const filled = assignmentsFor(plan.id).filter(
      (entry) => entry.source === "plan_member"
    );
    return [
      addFilled(
        {
          id: filled[0]?.positionId ?? "",
          name: STAGE_MANAGER.name,
          teamId: team.id,
          teamName: team.name,
          source: "plan_member",
          neededCount: 0,
        },
        filled
      ),
    ];
  }
  if (team.id === USHER.teamId) {
    return [
      {
        id: `needed-position:${USHER.neededPositionId}`,
        name: USHER.name,
        teamId: team.id,
        teamName: team.name,
        source: "needed_position",
        neededPositionId: USHER.neededPositionId,
        timeId: null,
        timePreferenceOptionId: null,
        neededCount: USHER.openCount,
      },
    ];
  }
  return [];
};

const teamPositionsFor = (plan: PlanSeed): TeamPositionGroup[] =>
  teamsFor(plan.serviceTypeId)
    .map((team) => ({
      teamId: team.id,
      teamName: team.name,
      positions: [
        ...team.positions.flatMap((position) => {
          const row = teamPosition(plan, team, position);
          return row === null ? [] : [row];
        }),
        ...showcaseExtras(plan, team),
      ].toSorted((a, b) => byName(a.name, b.name)),
    }))
    .filter(({ positions }) => positions.length > 0)
    .toSorted((a, b) => byName(a.teamName, b.teamName));

const adjacentPlans = (
  plan: PlanSeed,
  direction: "previous" | "next"
): Plan[] => {
  const siblings = plansFor(plan.serviceTypeId);
  const index = siblings.indexOf(plan);
  const nearest =
    direction === "next"
      ? siblings.slice(index + 1, index + 5)
      : siblings.slice(Math.max(0, index - 4), index).toReversed();
  return nearest.map(planOutput);
};

const catalog = {
  serviceTypes: {
    default: serviceTypes.map(({ id, name, sequence }) => ({
      id,
      name,
      sequence,
    })),
  },
  plans: {
    default: [],
    cases: serviceTypes.map(({ id }) => ({
      match: { serviceTypeId: id },
      output: plansFor(id).filter(isUpcoming).map(planOutput),
    })),
  },
  plan: {
    default: null,
    cases: plans.map((plan) => ({
      match: { planId: plan.id },
      output: planOutput(plan),
    })),
  },
  adjacentPlans: {
    default: [],
    cases: detailedPlans.flatMap((plan) =>
      (["previous", "next"] as const).map((direction) => ({
        match: { planId: plan.id, direction },
        output: adjacentPlans(plan, direction),
      }))
    ),
  },
  organization: { default: { timeZone: ORG_TIME_ZONE } },
  teamPositions: {
    default: [],
    cases: detailedPlans.map((plan) => ({
      match: { planId: plan.id },
      output: teamPositionsFor(plan),
    })),
  },
} satisfies AppFixtures["catalog"];

// Run sheet

const planTime = (time: PlanSeed["times"][number]): PlanTime => ({
  startsAt: time.startsAt,
  endsAt: time.endsAt,
  id: time.id,
  name: time.name,
  timeType: time.timeType,
  teamReminders: [],
  assignedTeamIds: [...time.teamIds],
  assignedPositionIds: [],
  splitTeamRehearsalAssignmentIds: [],
});

const keyOutput = (key: KeySeed): KeyOption => ({
  id: key.id,
  name: key.name,
  startingKey: key.startingKey,
  endingKey: key.endingKey,
});

const planItemSong = (song: SongSeed) => ({
  lastScheduledAt: lastScheduledAt(song.id),
  id: song.id,
  title: song.title,
  author: song.author,
  themes: song.themes,
});

const arrangementSummary = (arrangement: ArrangementSeed) => ({
  archivedAt: arrangement.archivedAt,
  id: arrangement.id,
  sequence: [...arrangement.sequence],
  length: arrangement.length,
  name: arrangement.name,
});

type ItemDraft =
  | {
      readonly kind: "header" | "item" | "media";
      readonly title: string;
      readonly servicePosition?: PlanItem["servicePosition"];
      readonly length?: number | null;
      readonly description?: string;
    }
  | { readonly kind: "song"; readonly use: SongUse };

const header = (
  title: string,
  servicePosition: PlanItem["servicePosition"] = "during"
): ItemDraft => ({ kind: "header", title, servicePosition, length: null });

const item = (
  title: string,
  length: number | null,
  description = "",
  servicePosition: PlanItem["servicePosition"] = "during"
): ItemDraft => ({ kind: "item", title, length, description, servicePosition });

const media = (title: string, length: number, description = ""): ItemDraft => ({
  kind: "media",
  title,
  length,
  description,
});

const songRows = (uses: readonly SongUse[]): ItemDraft[] =>
  uses.map((songUse) => ({ kind: "song", use: songUse }));

const toPlanItem = (
  plan: PlanSeed,
  draft: ItemDraft,
  index: number
): PlanItem => {
  const id = `${plan.id}${String(index + 1).padStart(2, "0")}`;
  const sequence = index + 1;
  if (draft.kind === "song") {
    const { song, arrangement, key, notes } = draft.use;
    const [layout] = songLayouts(song);
    return {
      song: planItemSong(song),
      arrangement: arrangementSummary(arrangement),
      id,
      title: song.title,
      itemType: "song",
      sequence,
      servicePosition: "during",
      length: arrangement.length,
      description: notes,
      htmlDetails: "",
      customArrangementSequence: [],
      key: key === null ? null : keyOutput(key),
      layout: key === null || layout === undefined ? null : layout,
    };
  }
  return {
    song: null,
    arrangement: null,
    id,
    title: draft.title,
    itemType: draft.kind,
    sequence,
    servicePosition: draft.servicePosition ?? "during",
    length: draft.length ?? null,
    description: draft.description ?? "",
    htmlDetails: "",
    customArrangementSequence: [],
    key: null,
    layout: null,
  };
};

const sundayDrafts = (
  plan: PlanSeed,
  uses: readonly SongUse[]
): ItemDraft[] => {
  if (uses.length === 0) {
    return [];
  }
  const isShowcase = plan.id === SHOWCASE_PLAN_ID;
  return [
    header("Pre-service", "pre"),
    item("Countdown", 300, "Video", "pre"),
    header("Worship"),
    ...songRows(uses.slice(0, 3)),
    item("Welcome", plan.day === "2026-10-11" ? null : 240, "Host"),
    isShowcase
      ? media("Fall Retreat Promo", 90, "Video from the youth team")
      : media("Announcements", 120, "Slides loop"),
    header("Message"),
    item("Sermon", 1920, isShowcase ? "Pastor" : preacherName),
    ...songRows(uses.slice(3)),
    item("Benediction", 120),
    header("Post-service", "post"),
    item("Exit playlist", 600, "", "post"),
  ];
};

const youthDrafts = (uses: readonly SongUse[]): ItemDraft[] => [
  header("Hangout", "pre"),
  item("Games", 900, "Four square in the gym", "pre"),
  header("Worship"),
  ...songRows(uses),
  header("Talk"),
  item("Message", 1200, "Marcus Webb"),
  item(
    "Small groups",
    1500,
    "Grades 6 to 8 in room 4, grades 9 to 12 in the loft"
  ),
];

const eventDrafts = (plan: PlanSeed, uses: readonly SongUse[]): ItemDraft[] => {
  switch (plan.title) {
    case "Baptism Night": {
      return [
        header("Welcome"),
        item("Welcome and prayer", 300, preacherName),
        header("Worship"),
        ...songRows(uses.slice(0, 3)),
        header("Baptisms"),
        item(
          "Baptism testimonies",
          1800,
          "Six baptisms, order in the shared doc"
        ),
        ...songRows(uses.slice(3)),
        item("Celebration and photos", 900, "Cake in the courtyard", "post"),
      ];
    }
    case "Night of Worship": {
      return [
        header("Worship"),
        ...songRows(uses.slice(0, 3)),
        item("Scripture reading", 180, "Psalm 63"),
        ...songRows(uses.slice(3)),
        item("Prayer", 600, "Open mics in the aisles"),
        item("Closing blessing", 120),
      ];
    }
    case "Thanksgiving Eve": {
      return [
        header("Gathering"),
        item("Welcome", 180, "Host"),
        ...songRows(uses),
        item("Gratitude stories", 1200, "Three families share"),
        item("Benediction", 120),
      ];
    }
    default: {
      return [
        header("Gathering"),
        ...songRows(uses),
        item("Backpack blessing", 600, "Students come forward"),
      ];
    }
  }
};

const draftsFor = (plan: PlanSeed): ItemDraft[] => {
  const uses = songUsesFor(plan.id);
  if (plan.serviceTypeId === SUNDAY) {
    return sundayDrafts(plan, uses);
  }
  return plan.serviceTypeId === YOUTH
    ? youthDrafts(uses)
    : eventDrafts(plan, uses);
};

const planItemsFor = (plan: PlanSeed): PlanItem[] =>
  draftsFor(plan).map((draft, index) => toPlanItem(plan, draft, index));

const showcaseItems = planItemsFor(planById(SHOWCASE_PLAN_ID));
const showcaseSongItem = showcaseItems.find(
  ({ itemType }) => itemType === "song"
);
const showcaseTimes = planById(SHOWCASE_PLAN_ID).times.map(planTime);

const requireValue = <Value>(value: Value | undefined, what: string): Value => {
  if (value === undefined) {
    throw new Error(`Missing ${what}`);
  }
  return value;
};

const planItems = {
  list: {
    default: [],
    cases: detailedPlans.map((plan) => ({
      match: { planId: plan.id },
      output: planItemsFor(plan),
    })),
  },
  create: {
    default: toPlanItem(planById(SHOWCASE_PLAN_ID), item("New Item", null), 40),
  },
  update: { default: requireValue(showcaseSongItem, "a showcase song") },
  delete: { default: { success: true } },
  reorder: { default: { success: true } },
} satisfies AppFixtures["planItems"];

const planTimes = {
  list: {
    default: [],
    cases: detailedPlans.map((plan) => ({
      match: { planId: plan.id },
      output: plan.times.map(planTime),
    })),
  },
  create: {
    default: {
      ...requireValue(showcaseTimes[1], "a showcase service"),
      id: `${SHOWCASE_PLAN_ID}4`,
      name: "New service",
    },
  },
  update: { default: requireValue(showcaseTimes[1], "a showcase service") },
  delete: { default: undefined },
} satisfies AppFixtures["planTimes"];

// People: Assign

const preferencesFor = (seed: PersonSeed) => ({
  schedulePreference: seed.preferences?.schedulePreference ?? "Every week",
  preferredWeeks: [...(seed.preferences?.preferredWeeks ?? [])],
  timePreferenceOptionIds: [],
  maxPlansPerDay: seed.preferences?.maxPlansPerDay ?? null,
  maxPlansPerMonth: seed.preferences?.maxPlansPerMonth ?? null,
});

const SLOT_STATUS: Record<StatusCode, "confirmed" | "pending" | "declined"> = {
  C: "confirmed",
  U: "pending",
  D: "declined",
};

const rosterLabel = (entry: AssignmentSeed) =>
  `${entry.team.name} - ${entry.positionName}`;

const candidatesFor = (
  ref: PositionRef,
  plan: PlanSeed | null
): PositionCandidates => {
  const slotEntries =
    plan === null
      ? []
      : assignmentsFor(plan.id).filter(
          (entry) => entry.positionId === ref.position.id
        );
  const roster = rosterFor(ref.position.id);
  const extra = slotEntries
    .map(({ person }) => person)
    .filter((seed) => !roster.includes(seed));
  const match: PositionCandidates["match"] = {
    teamId: ref.team.id,
    selectedPositionName: ref.position.name,
    selectedTeamName: ref.team.name,
  };
  // A roster read for any plan names none; MockTransport fills in the requested plan.
  if (plan !== null) {
    match.planId = plan.id;
  }
  return {
    generatedAt: GENERATED_AT,
    timeZone: ORG_TIME_ZONE,
    match,
    candidates: [...roster, ...extra].toSorted(byLastName).map((seed) => {
      const slot = slotEntries.find(({ person }) => person === seed);
      const labels =
        plan === null
          ? []
          : assignmentsFor(plan.id)
              .filter((entry) => entry.person === seed && entry.status !== "D")
              .map(rosterLabel);
      return {
        id: seed.id,
        firstName: seed.firstName,
        lastName: seed.lastName,
        fullName: fullName(seed),
        photoUrl: null,
        photoThumbnailUrl: null,
        archived: false,
        selectedPlanRosterLabels: labels,
        selectedPlanSlot:
          slot === undefined
            ? null
            : {
                planPersonId: slot.planPersonId,
                status: SLOT_STATUS[slot.status],
                declineReason: slot.declineReason,
              },
        schedulingPreferences: roster.includes(seed)
          ? preferencesFor(seed)
          : null,
      };
    }),
  };
};

/** Plans and positions with a declined slot: the one thing team positions can't say. */
const declinedSlots = allAssignments.filter(
  (entry) => entry.status === "D" && entry.plan.detailed
);

const candidateCases = [
  ...positionRefs
    .filter(({ team }) => team.serviceTypeId === SUNDAY)
    .map((ref) => ({
      match: { planId: SHOWCASE_PLAN_ID, positionId: ref.position.id },
      output: candidatesFor(ref, planById(SHOWCASE_PLAN_ID)),
    })),
  ...declinedSlots
    .filter(({ plan }) => plan.id !== SHOWCASE_PLAN_ID)
    .map((entry) => {
      const ref = positionRefs.find(
        ({ position }) => position.id === entry.positionId
      );
      return {
        match: { planId: entry.plan.id, positionId: entry.positionId },
        output: candidatesFor(requireValue(ref, "a position"), entry.plan),
      };
    }),
  ...positionRefs.map((ref) => ({
    match: { positionId: ref.position.id },
    output: candidatesFor(ref, null),
  })),
];

const WINDOW_HALF_DAYS = 28;

const windowPlansAround = (plan: PlanSeed): PlanSeed[] =>
  plans.filter(
    (candidate) =>
      candidate.scheduled &&
      Math.abs(daysBetween(plan.day, candidate.day)) <= WINDOW_HALF_DAYS
  );

const windowRow = (entry: AssignmentSeed) => ({
  id: entry.planPersonId,
  planId: entry.plan.id,
  teamId: entry.team.id,
  teamPositionName: entry.positionName,
  status: entry.status,
  createdAt: iso(entry.createdAt),
  timeIds: [...entry.timeIds],
  serviceTimeIds: [...entry.serviceTimeIds],
  declineReason: entry.declineReason,
});

const windowBatch = (
  loaded: readonly PlanSeed[],
  deferred: readonly PlanSeed[],
  deferredServiceTypeIds: readonly string[]
): PlanWindowHistoryBatch => {
  const rowsByPerson = new Map<string, ReturnType<typeof windowRow>[]>();
  for (const plan of loaded) {
    for (const entry of assignmentsFor(plan.id)) {
      const rows = rowsByPerson.get(entry.person.id) ?? [];
      rows.push(windowRow(entry));
      rowsByPerson.set(entry.person.id, rows);
    }
  }
  return {
    generatedAt: GENERATED_AT,
    loadedPlanCount: loaded.length,
    plans: loaded.map((plan) => ({
      id: plan.id,
      title: plan.title,
      sortDate: iso(plan.sortDate),
      serviceTypeName: serviceTypeName(plan.serviceTypeId),
    })),
    planTimes: loaded.flatMap((plan) =>
      plan.times.map((time) => ({
        id: time.id,
        startsAt: iso(time.startsAt),
        timeType: time.timeType,
      }))
    ),
    people: [...rowsByPerson].map(([personId, rows]) => ({ personId, rows })),
    deferredPlans: deferred.map((plan) => ({
      serviceTypeId: plan.serviceTypeId,
      planId: plan.id,
      rosterRequests: 1,
    })),
    deferredServiceTypeIds: [...deferredServiceTypeIds],
    requestBudget: {
      limit: PROGRESSIVE_REQUEST_BUDGET,
      planningCenterRequests: 2 + loaded.length,
      planRangeRequests: 2,
      rosterRequests: loaded.length,
    },
  };
};

const fullWindow = (plan: PlanSeed) =>
  windowBatch(windowPlansAround(plan), [], []);

/** The showcase window arrives in two calls, so the continuation path is exercised. */
const showcaseWindowCalls = () => {
  const showcase = planById(SHOWCASE_PLAN_ID);
  const window = windowPlansAround(showcase);
  const listed = window.filter(({ serviceTypeId }) => serviceTypeId !== EVENTS);
  const firstCount = Math.ceil(listed.length * 0.6);
  const first = listed.slice(0, firstCount);
  const deferred = listed.slice(firstCount);
  const events = window.filter(({ serviceTypeId }) => serviceTypeId === EVENTS);
  return {
    first: windowBatch(first, deferred, [EVENTS]),
    second: windowBatch([...deferred, ...events], [], []),
    continuation: {
      plans: deferred.map((plan) => ({
        serviceTypeId: plan.serviceTypeId,
        planId: plan.id,
        rosterRequests: 1,
      })),
      serviceTypeIds: [EVENTS],
    },
    date: iso(showcase.sortDate),
  };
};

const showcaseWindow = showcaseWindowCalls();

const isBlockedFor = (seed: PersonSeed, plan: PlanSeed) =>
  blockoutWindows(seed).some((window) =>
    blockoutCoversPlanSortInstant(plan.sortDate, {
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      timeZone: ORG_TIME_ZONE,
    })
  );

const rosterPeopleFor = (serviceTypeId: string): PersonSeed[] =>
  people
    .filter((seed) =>
      seed.positions.some((positionId) =>
        positionRefs.some(
          ({ position, team }) =>
            position.id === positionId && team.serviceTypeId === serviceTypeId
        )
      )
    )
    .toSorted(byLastName);

const detailsBatch = (
  seeds: readonly PersonSeed[],
  plan: PlanSeed | null
): CandidateDetailsBatch => {
  const blocked =
    plan === null ? [] : seeds.filter((seed) => isBlockedFor(seed, plan));
  return {
    generatedAt: GENERATED_AT,
    people: seeds.map((seed) => ({
      personId: seed.id,
      isBlockedForDate: blocked.includes(seed),
    })),
    deferredPersonIds: [],
    blockoutProgress: [],
    requestBudget: {
      limit: PROGRESSIVE_REQUEST_BUDGET,
      planningCenterRequests: seeds.length + blocked.length,
      firstReadRequests: seeds.length,
      blockoutDateRequests: blocked.length,
      planTimeRequests: 0,
    },
  };
};

const plansWithBlockouts = detailedPlans.filter((plan) =>
  rosterPeopleFor(plan.serviceTypeId).some((seed) => isBlockedFor(seed, plan))
);

// People: dashboard

const teamPeople = people.filter(({ positions }) => positions.length > 0);

const teamsOf = (seed: PersonSeed): string[] => [
  ...new Set(
    teams
      .filter((team) =>
        team.positions.some(({ id }) => seed.positions.includes(id))
      )
      .map(({ name }) => name)
  ),
];

const rosterPerson = (seed: PersonSeed): PeopleDashboardRosterPerson => ({
  id: seed.id,
  name: fullName(seed),
  initials: initialsFromName(fullName(seed)),
  photoThumbnailUrl: null,
  teams: teamsOf(seed),
});

const planWorkspaceUrl = (plan: PlanSeed) =>
  `/services/${plan.serviceTypeId}/plans/${plan.id}/lineup`;

const scheduleItems = (seed: PersonSeed): ScheduleItem[] =>
  assignmentsOf(seed.id)
    .filter(({ status }) => status !== "D")
    .flatMap((entry) =>
      entry.plan.times
        .filter(({ id }) => entry.timeIds.includes(id))
        .map((time) => ({
          id: `${entry.planPersonId}:${time.id}`,
          sourceScheduleId: entry.planPersonId,
          date: time.startsAt,
          teamPositionName: entry.positionName,
          teamName: entry.team.name,
          serviceTypeName: serviceTypeName(entry.plan.serviceTypeId),
          planTitle: entry.plan.title,
          status: entry.status,
          planUrl: planWorkspaceUrl(entry.plan),
          timeType: time.timeType,
        }))
    );

const rhythmFor = (seed: PersonSeed) =>
  buildServingRhythm(
    assignmentsOf(seed.id).map((entry) => ({
      status: entry.status,
      sortDate: entry.plan.sortDate,
      serviceDates:
        entry.status === "D"
          ? []
          : entry.plan.times
              .filter(({ id }) => entry.serviceTimeIds.includes(id))
              .map(({ startsAt }) => startsAt),
    })),
    ANCHOR_NOW,
    ORG_TIME_ZONE
  );

const CURRENT_MONTH = ANCHOR_SUNDAY.slice(0, 7);

const activityFor = (
  seed: PersonSeed,
  monthKey = CURRENT_MONTH
): PeopleDashboardActivity => {
  const items = scheduleItems(seed);
  return {
    id: seed.id,
    rhythm: rhythmFor(seed),
    roles: getMostCommonRoles(items),
    monthDays: buildPersonMonthDays(
      itemsInMonth(items, monthKey, ORG_TIME_ZONE),
      ORG_TIME_ZONE
    ),
  };
};

const monthInfo = (monthKey: string) =>
  getMonthInfo(at(`${monthKey}-15`, "12:00"), ORG_TIME_ZONE);

const shiftMonth = (monthKey: string, delta: number): string => {
  const [year = 0, month = 1] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** People whose month left rehearsal times unread, so the partial note shows. */
const partialRehearsals = new Map([["4100109", 2]]);

const personDetail = (
  seed: PersonSeed,
  monthKey: string
): PeopleDashboardPersonDetail => {
  const activity = activityFor(seed, monthKey);
  const servedTeams = [
    ...new Set(scheduleItems(seed).flatMap(({ teamName }) => teamName ?? [])),
  ];
  return {
    generatedAt: GENERATED_AT,
    month: monthInfo(monthKey),
    previousMonth: shiftMonth(monthKey, -1),
    nextMonth: shiftMonth(monthKey, 1),
    person: {
      ...rosterPerson(seed),
      teams: servedTeams.length > 0 ? servedTeams : teamsOf(seed),
      rhythm: activity.rhythm,
      roles: activity.roles,
      monthDays: activity.monthDays,
    },
    requestBudget: {
      limit: PROGRESSIVE_REQUEST_BUDGET,
      planningCenterRequests: 6,
      unresolvedRehearsalTimes: partialRehearsals.get(seed.id) ?? 0,
    },
  };
};

/** Months the showcase person can page through; everyone else has this month. */
const SHOWCASE_MONTHS = [-2, -1, 1, 2].map((delta) =>
  shiftMonth(CURRENT_MONTH, delta)
);

const blockoutsFor = (seed: PersonSeed): Blockout[] =>
  blockoutWindows(seed)
    .filter(({ endsAt }) => endsAt >= ANCHOR_NOW)
    .map(({ seed: blockout, startsAt, endsAt }) => ({
      id: blockout.id,
      reason: blockout.reason,
      startsAt,
      endsAt,
      description: blockout.description,
      share: true,
      timeZone: ORG_TIME_ZONE,
    }));

const searchResult = (seed: PersonSeed) => ({
  id: seed.id,
  firstName: seed.firstName,
  lastName: seed.lastName,
  fullName: fullName(seed),
  photoThumbnailUrl: null,
});

const peopleFixtures = {
  positionCandidates: {
    default: {
      generatedAt: GENERATED_AT,
      timeZone: ORG_TIME_ZONE,
      match: {},
      candidates: [],
    },
    cases: candidateCases,
  },
  planWindowHistory: {
    default: fullWindow(planById(SHOWCASE_PLAN_ID)),
    cases: [
      {
        match: {
          date: showcaseWindow.date,
          continuation: showcaseWindow.continuation,
        },
        output: showcaseWindow.second,
      },
      { match: { date: showcaseWindow.date }, output: showcaseWindow.first },
    ],
  },
  candidateDetails: {
    default: detailsBatch(teamPeople.toSorted(byLastName), null),
    cases: plansWithBlockouts.map((plan) => ({
      match: { planId: plan.id },
      output: detailsBatch(rosterPeopleFor(plan.serviceTypeId), plan),
    })),
  },
  search: {
    default: people.toSorted(byLastName).map(searchResult),
  },
  blockouts: {
    default: [],
    cases: people
      .filter((seed) => blockoutsFor(seed).length > 0)
      .map((seed) => ({
        match: { personId: seed.id },
        output: blockoutsFor(seed),
      })),
  },
  dashboardRoster: {
    default: {
      generatedAt: GENERATED_AT,
      month: monthInfo(CURRENT_MONTH),
      people: teamPeople.toSorted(byLastName).map(rosterPerson),
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        serviceTypeName: serviceTypeName(team.serviceTypeId),
        personIds: rosterPeopleFor(team.serviceTypeId)
          .filter((seed) =>
            team.positions.some(({ id }) => seed.positions.includes(id))
          )
          .map(({ id }) => id),
      })),
      ledTeamIds: teams
        .filter(({ id }) => id === "2201" || id === "2202")
        .map(({ id }) => id),
    },
  },
  dashboardActivity: {
    default: {
      generatedAt: GENERATED_AT,
      people: teamPeople.toSorted(byLastName).map((seed) => activityFor(seed)),
      deferredPersonIds: [],
      requestBudget: {
        limit: PROGRESSIVE_REQUEST_BUDGET,
        planningCenterRequests: 16,
        scheduleRequests: 16,
        planTimeRequests: 0,
      },
    },
  },
  dashboardPerson: {
    default: personDetail(personById(SHOWCASE_PERSON_ID), CURRENT_MONTH),
    cases: [
      ...SHOWCASE_MONTHS.map((month) => ({
        match: { personId: SHOWCASE_PERSON_ID, month },
        output: personDetail(personById(SHOWCASE_PERSON_ID), month),
      })),
      ...teamPeople.map((seed) => ({
        match: { personId: seed.id },
        output: personDetail(seed, CURRENT_MONTH),
      })),
    ],
  },
  myScheduledPlans: {
    default: {
      planIds: assignmentsOf(VIEWER_ID)
        .filter(({ status, plan }) => status !== "D" && isUpcoming(plan))
        .map(({ plan }) => plan.id),
    },
  },
} satisfies AppFixtures["people"];

// Songs

const catalogEntry = (song: SongSeed): SongCatalogEntry => ({
  lastScheduledAt: lastScheduledAt(song.id),
  id: song.id,
  title: song.title,
  author: song.author,
  themes: song.themes,
  hidden: song.hidden,
});

const arrangementOption = (
  arrangement: ArrangementSeed
): ArrangementOption => ({
  id: arrangement.id,
  name: arrangement.name,
  sequence: [...arrangement.sequence],
  length: arrangement.length,
  bpm: arrangement.bpm,
  meter: arrangement.meter,
  archived: arrangement.archivedAt !== null,
  keys: arrangement.keys.map(keyOutput),
});

const optionsFor = (song: SongSeed): SongOptionSet => {
  const lastSunday = songUses.findLast(
    (songUse) =>
      songUse.song === song &&
      songUse.plan.serviceTypeId === SUNDAY &&
      songUse.plan.sortDate <= ANCHOR_NOW
  );
  const arrangement = lastSunday?.arrangement ?? liveArrangement(song);
  const layouts = songLayouts(song);
  return {
    song: catalogEntry(song),
    arrangements: song.arrangements.map(arrangementOption),
    layouts,
    currentLayout: null,
    suggestedArrangementId: arrangement.id,
    suggestedKeyId: lastSunday?.key?.id ?? arrangement.keys[0]?.id ?? null,
    suggestedLayoutId: layouts[0]?.id ?? null,
    layoutMode: "editable",
  };
};

const YEAR_DAYS = 365;

const historyFor = (song: SongSeed): SongHistoryEntry[] =>
  songUses
    .filter(
      (songUse) =>
        songUse.song === song &&
        songUse.plan.sortDate >= minusDays(ANCHOR_NOW, YEAR_DAYS)
    )
    .toReversed()
    .map(({ plan, arrangement, key }) => ({
      planId: plan.id,
      serviceTypeId: plan.serviceTypeId,
      serviceTypeName: serviceTypeName(plan.serviceTypeId),
      sortDate: plan.sortDate,
      keyName: key?.name ?? null,
      startingKey: key?.startingKey ?? null,
      arrangementName: arrangement.name,
    }));

const RESTING_AFTER_DAYS = 90;
const RESTING_LIMIT = 30;

const playedSongs = songs
  .filter((song) => !song.hidden)
  .map((song) => ({ song, playedAt: lastScheduledAt(song.id) }))
  .filter(
    (entry): entry is { song: SongSeed; playedAt: Date } =>
      entry.playedAt !== null && entry.playedAt <= ANCHOR_NOW
  )
  .toSorted((a, b) => b.playedAt.getTime() - a.playedAt.getTime());

const restingBefore = minusDays(ANCHOR_NOW, RESTING_AFTER_DAYS);

const songsFixtures = {
  search: {
    default: songs
      .toSorted((a, b) => byName(a.title, b.title))
      .map(catalogEntry),
  },
  suggestions: {
    default: {
      recentlyPlayed: playedSongs
        .filter(({ playedAt }) => playedAt >= restingBefore)
        .map(({ song }) => catalogEntry(song)),
      resting: playedSongs
        .filter(({ playedAt }) => playedAt < restingBefore)
        .slice(0, RESTING_LIMIT)
        .map(({ song }) => catalogEntry(song)),
    },
  },
  library: {
    default: {
      songs: songs
        .filter((song) => !song.hidden)
        .toSorted((a, b) => byName(a.title, b.title))
        .map((song) => ({
          id: song.id,
          title: song.title,
          author: song.author,
          themes: song.themes,
          lastScheduledAt: lastScheduledAt(song.id),
          createdAt: song.createdAt,
        })),
      truncated: false,
    },
  },
  history: {
    default: [],
    cases: songs.map((song) => ({
      match: { songId: song.id },
      output: historyFor(song),
    })),
  },
  options: {
    default: optionsFor(songById(SHOWCASE_SONG_ID)),
    cases: songs.map((song) => ({
      match: { songId: song.id },
      output: optionsFor(song),
    })),
  },
} satisfies AppFixtures["songs"];

// Chord charts

const chordChartArrangement = (
  arrangement: ArrangementSeed
): ChordChartArrangement => ({
  id: arrangement.id,
  name: arrangement.name,
  archived: arrangement.archivedAt !== null,
  chordChart: arrangement.chart,
  chordChartKey: arrangement.chartKey,
  lyrics: lyricsFromChart(arrangement.chart),
  keys: arrangement.keys.map(keyOutput),
  layout: { ...arrangement.layout },
  updatedAt: arrangement.updatedAt,
});

const chordChartSong = (song: SongSeed): ChordChartSongOutput => ({
  song: { id: song.id, title: song.title, author: song.author },
  arrangements: song.arrangements.map(chordChartArrangement),
});

const showcaseSong = songById(SHOWCASE_SONG_ID);
const showcaseArrangement = chordChartArrangement(
  liveArrangement(showcaseSong)
);
const chartedSongs = songs.filter((song) =>
  song.arrangements.some(({ chart }) => chart !== "")
);

const NEW_SONG_ID = "5599";

const chordCharts = {
  song: {
    default: chordChartSong(showcaseSong),
    cases: songs.map((song) => ({
      match: { songId: song.id },
      output: chordChartSong(song),
    })),
  },
  update: { default: showcaseArrangement },
  create: {
    default: {
      ...showcaseArrangement,
      id: `${SHOWCASE_SONG_ID}9`,
      name: "Acoustic",
      updatedAt: GENERATED_AT,
    },
  },
  createSong: {
    default: {
      song: { id: NEW_SONG_ID, title: "New Song", author: "" },
      arrangements: [
        {
          id: `${NEW_SONG_ID}1`,
          name: "Default Arrangement",
          archived: false,
          chordChart: "",
          chordChartKey: null,
          lyrics: "",
          keys: [],
          layout: {
            font: null,
            fontSize: null,
            columns: null,
            chordColor: null,
            pageSize: null,
            orientation: null,
            margin: null,
          },
          updatedAt: GENERATED_AT,
        },
      ],
    },
  },
  pdf: {
    default: { data: chordChartPdf(showcaseSong) },
    cases: chartedSongs.map((song) => ({
      match: { songId: song.id },
      output: { data: chordChartPdf(song) },
    })),
  },
  lyricsSearch: {
    default: [
      {
        id: "lrc-20417",
        title: "Morning Light",
        artist: "Maya Ellison",
        album: "Songs for Sunday",
        durationSeconds: 296,
        lyrics: lyricsFromChart(liveArrangement(showcaseSong).chart),
      },
      {
        id: "lrc-88112",
        title: "Morning Light (Live)",
        artist: "Cedar Grove Worship",
        album: null,
        durationSeconds: 341,
        lyrics: lyricsFromChart(liveArrangement(showcaseSong).chart),
      },
    ],
  },
} satisfies AppFixtures["chordCharts"];

// Identity, access, and the rest

const accounts = {
  list: {
    default: {
      session: {
        userId: "usr_9f3c2a7d1e",
        name: fullName(personById(VIEWER_ID)),
        email: viewerEmail,
        image: null,
      },
      selectedAccountId: "acct_cedargrove",
      accounts: [
        {
          id: "acct_cedargrove",
          providerId: "planning-center",
          updatedAt: "2026-09-28T15:12:44.000Z",
          identity: {
            sub: VIEWER_ID,
            name: fullName(personById(VIEWER_ID)),
            email: viewerEmail,
            organizationId: organization.id,
            organizationName: organization.name,
          },
        },
        {
          id: "acct_northside",
          providerId: "planning-center",
          updatedAt: "2026-08-14T02:40:10.000Z",
          identity: {
            sub: otherAccount.personId,
            name: fullName(personById(VIEWER_ID)),
            email: otherAccount.email,
            organizationId: otherAccount.organizationId,
            organizationName: otherAccount.organizationName,
          },
        },
      ],
      demo: false,
    },
  },
  select: {
    default: { success: true, selectedAccountId: "acct_cedargrove" },
    cases: [
      {
        match: { accountId: "acct_northside" },
        output: { success: true, selectedAccountId: "acct_northside" },
      },
    ],
  },
} satisfies AppFixtures["accounts"];

const access = {
  me: {
    default: {
      services: {
        status: "granted",
        organizationAdministrator: true,
        planLevel: "Administrator",
        maxPlanLevel: "Administrator",
        songLevel: "Administrator",
        canViewAllPeople: true,
        ledTeamCount: 2,
        serviceTypes: serviceTypes.map(({ id, name }) => ({
          id,
          name,
          level: "Administrator",
        })),
      },
      people: { status: "granted" },
    },
  },
} satisfies AppFixtures["access"];

const scheduleFixtures = {
  assign: {
    default: { success: true, data: { id: `${SHOWCASE_PLAN_ID}091` } },
  },
  remove: { default: { success: true } },
  updateStatus: { default: { success: true } },
} satisfies AppFixtures["schedule"];

export const fixtures = {
  access,
  accounts,
  catalog,
  chordCharts,
  demo: {
    start: { default: { demo: true } },
    exit: { default: { demo: false } },
  },
  features: { status: { default: { people: true, chordCharts: true } } },
  feedback: { submit: { default: { id: 1 } } },
  health: { default: { status: "ok", version: "mock" } },
  neededPositions: { adjust: { default: { openCount: 1 } } },
  people: peopleFixtures,
  planFiles: {
    list: { default: { files: [], nextOffset: null } },
    open: { default: { url: "https://example.com/file.pdf", preview: false } },
  },
  planItems,
  planPeople: { updateTimes: { default: { ok: true } } },
  planTimes,
  schedule: scheduleFixtures,
  session: { status: { default: { authenticated: true } } },
  songs: songsFixtures,
} satisfies AppFixtures;

/** Ids screenshot and UI test agents deep link to. */
export const showcase = {
  serviceTypeId: SUNDAY,
  planId: SHOWCASE_PLAN_ID,
  personId: SHOWCASE_PERSON_ID,
  songId: SHOWCASE_SONG_ID,
  arrangementId: liveArrangement(showcaseSong).id,
  youthPlanId: SHOWCASE_YOUTH_PLAN_ID,
  eventPlanId: SHOWCASE_EVENT_PLAN_ID,
  viewerPersonId: VIEWER_ID,
  anchorSunday: ANCHOR_SUNDAY,
  anchorNow: GENERATED_AT,
} as const;
