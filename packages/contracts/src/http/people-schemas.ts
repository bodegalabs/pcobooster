/** People answers over Effect RPC. Ported from the zod schemas in `../people-schemas.ts`. */
import {
  finiteNumber,
  integer,
  mutableArray,
  requiredId,
} from "@pcobooster/contracts/http/schema";
import { Schema } from "effect";

const MAX_ROSTER_REQUESTS = 100;
const MAX_CHECKED_BLOCKOUTS = 1000;

export const blockoutSchema = Schema.Struct({
  id: Schema.String,
  reason: Schema.String,
  startsAt: Schema.Date,
  endsAt: Schema.Date,
  description: Schema.String,
  share: Schema.Boolean,
  timeZone: Schema.optional(Schema.NullOr(Schema.String)),
});

/** A person's Planning Center scheduling preferences for the position. */
export const schedulingPreferencesSchema = Schema.Struct({
  schedulePreference: Schema.NullOr(Schema.String),
  preferredWeeks: mutableArray(integer),
  timePreferenceOptionIds: mutableArray(Schema.String),
  maxPlansPerDay: Schema.NullOr(integer),
  maxPlansPerMonth: Schema.NullOr(integer),
});

/** The selected plan and slot candidates are matched against. */
export const selectedPlanMatchSchema = Schema.Struct({
  planId: Schema.optional(Schema.String),
  teamId: Schema.optional(Schema.String),
  selectedPositionName: Schema.optional(Schema.String),
  selectedTeamName: Schema.optional(Schema.String),
});

export const selectedPlanSlotSchema = Schema.Struct({
  planPersonId: Schema.String,
  status: Schema.Literals(["confirmed", "pending", "declined"]),
  declineReason: Schema.NullOr(Schema.String),
});

/** A candidate with the selected plan's fresh roster applied; no history or availability. */
export const positionCandidateSchema = Schema.Struct({
  id: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  fullName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  photoThumbnailUrl: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  selectedPlanRosterLabels: mutableArray(Schema.String),
  selectedPlanSlot: Schema.NullOr(selectedPlanSlotSchema),
  /** Null for people on the selected slot who are not assigned to the position. */
  schedulingPreferences: Schema.NullOr(schedulingPreferencesSchema),
});

export const positionCandidatesSchema = Schema.Struct({
  generatedAt: Schema.String,
  timeZone: Schema.String,
  match: selectedPlanMatchSchema,
  candidates: mutableArray(positionCandidateSchema),
});

export const serviceHistoryItemSchema = Schema.Struct({
  id: Schema.String,
  sourceScheduleId: Schema.String,
  planId: Schema.optional(Schema.String),
  date: Schema.Date,
  teamPositionName: Schema.String,
  teamName: Schema.optional(Schema.String),
  serviceTypeName: Schema.optional(Schema.String),
  planTitle: Schema.optional(Schema.String),
  status: Schema.String,
  timeType: Schema.optional(Schema.Literals(["service", "rehearsal", "other"])),
});

/** One of a person's selected-plan assignments as history saw it. */
export const selectedPlanAssignmentSchema = Schema.Struct({
  source: Schema.Literals(["planPerson", "schedule"]),
  id: Schema.String,
  planId: Schema.NullOr(Schema.String),
  teamId: Schema.NullOr(Schema.String),
  teamName: Schema.NullOr(Schema.String),
  teamPositionName: Schema.String,
  status: Schema.String,
  planPersonId: Schema.NullOr(Schema.String),
  declineReason: Schema.NullOr(Schema.String),
});

export const candidateHistorySchema = Schema.Struct({
  /** Unsorted; the browser sorts, summarizes, and trims them. */
  serviceHistory: mutableArray(serviceHistoryItemSchema),
  selectedPlanAssignments: mutableArray(selectedPlanAssignmentSchema),
});

/** A plan a `people.planWindowHistory` call left for the next one: part of its cursor. */
export const windowPlanRefSchema = Schema.Struct({
  serviceTypeId: requiredId,
  planId: requiredId,
  /** Roster pages the plan needs; a follow-up call reserves them before locating plans. */
  rosterRequests: integer.check(
    Schema.isGreaterThanOrEqualTo(0),
    Schema.isLessThanOrEqualTo(MAX_ROSTER_REQUESTS)
  ),
});

export const windowPlanSummarySchema = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  sortDate: Schema.NullOr(Schema.String),
  serviceTypeName: Schema.NullOr(Schema.String),
});

export const windowPlanTimeSchema = Schema.Struct({
  id: Schema.String,
  startsAt: Schema.NullOr(Schema.String),
  timeType: Schema.NullOr(Schema.String),
});

export const windowRosterRowSchema = Schema.Struct({
  id: Schema.String,
  planId: Schema.NullOr(Schema.String),
  teamId: Schema.NullOr(Schema.String),
  teamPositionName: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  timeIds: mutableArray(Schema.String),
  serviceTimeIds: mutableArray(Schema.String),
  declineReason: Schema.NullOr(Schema.String),
});

export const planWindowHistoryBatchSchema = Schema.Struct({
  generatedAt: Schema.String,
  /** Rosters read by this call, including plans with no one scheduled. */
  loadedPlanCount: finiteNumber,
  /** Plans and times the rows point at; the browser expands rows into history items. */
  plans: mutableArray(windowPlanSummarySchema),
  planTimes: mutableArray(windowPlanTimeSchema),
  people: mutableArray(
    Schema.Struct({
      personId: Schema.String,
      rows: mutableArray(windowRosterRowSchema),
    })
  ),
  /** Listed plans left for a follow-up call, in window order. */
  deferredPlans: mutableArray(windowPlanRefSchema),
  /** Service types not listed yet; their plans follow `deferredPlans`. */
  deferredServiceTypeIds: mutableArray(Schema.String),
  requestBudget: Schema.Struct({
    limit: finiteNumber,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: finiteNumber,
    planRangeRequests: finiteNumber,
    rosterRequests: finiteNumber,
  }),
});

export const candidateDetailSchema = Schema.Struct({
  personId: Schema.String,
  isBlockedForDate: Schema.Boolean,
  /** The person's own schedule history, only when it was asked for. */
  history: Schema.optional(candidateHistorySchema),
});

/** Blockout checks a previous call already did for a person it left unfinished. */
export const blockoutProgressSchema = Schema.Struct({
  personId: requiredId,
  /** Repeating blockouts read and found not to cover the plan day. */
  checkedBlockoutIds: mutableArray(requiredId).check(
    Schema.isMaxLength(MAX_CHECKED_BLOCKOUTS)
  ),
  /** A blockout was found to cover the plan day. */
  blocked: Schema.Boolean,
});

export const candidateDetailsBatchSchema = Schema.Struct({
  generatedAt: Schema.String,
  people: mutableArray(candidateDetailSchema),
  /** Requested people left for a follow-up call to stay within the budget. */
  deferredPersonIds: mutableArray(Schema.String),
  /** Pass back with `deferredPersonIds`; the next call skips checks already done. */
  blockoutProgress: mutableArray(blockoutProgressSchema),
  requestBudget: Schema.Struct({
    limit: finiteNumber,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: finiteNumber,
    /** Blockout lists and schedule pages. */
    firstReadRequests: finiteNumber,
    blockoutDateRequests: finiteNumber,
    planTimeRequests: finiteNumber,
  }),
});

export const peopleDashboardDayKindSchema = Schema.Literals([
  "service",
  "rehearsal",
]);

export const peopleDashboardMonthSchema = Schema.Struct({
  year: finiteNumber,
  monthIndex: finiteNumber,
  label: Schema.String,
  daysInMonth: finiteNumber,
  startsOnWeekday: finiteNumber,
});

/** Who is on the roster: identity and teams, with no schedule reads behind it. */
export const peopleDashboardRosterPersonSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  initials: Schema.String,
  photoThumbnailUrl: Schema.NullOr(Schema.String),
  teams: mutableArray(Schema.String),
});

const CALENDAR_DAY_KEY = /^\d{4}-\d{2}-\d{2}$/u;
const calendarDayKeySchema = Schema.String.check(
  Schema.isPattern(CALENDAR_DAY_KEY)
);

/** How a person has been serving and responding; days are org `YYYY-MM-DD`. */
export const servingRhythmSchema = Schema.Struct({
  lastServedOn: Schema.NullOr(calendarDayKeySchema),
  nextServingOn: Schema.NullOr(calendarDayKeySchema),
  servedDays30: finiteNumber,
  servedDays90: finiteNumber,
  servedDays180: finiteNumber,
  upcomingDays30: finiteNumber,
  /** Median days between served days in the last 180; null with too few. */
  typicalGapDays: Schema.NullOr(finiteNumber),
  /** Schedules dated in the last 180 days through today, declined included. */
  requests180: finiteNumber,
  declined180: finiteNumber,
  /** Upcoming schedules still unconfirmed. */
  pendingUpcoming: finiteNumber,
  nextPendingOn: Schema.NullOr(calendarDayKeySchema),
});

/** A service or rehearsal day in a person's month, one per position, service type, and status. */
export const peopleDashboardMonthDaySchema = Schema.Struct({
  day: finiteNumber,
  kind: peopleDashboardDayKindSchema,
  positionName: Schema.optional(Schema.String),
  serviceTypeName: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  planUrl: Schema.optional(Schema.String),
});

/** How one roster person is serving, derived from their own schedules. */
export const peopleDashboardActivitySchema = Schema.Struct({
  id: Schema.String,
  rhythm: servingRhythmSchema,
  /** Their most common positions, most common first; empty without schedules. */
  roles: mutableArray(Schema.String),
  /** The month's services and rehearsals, by day. */
  monthDays: mutableArray(peopleDashboardMonthDaySchema),
});

const { id: _activityId, ...activityFields } =
  peopleDashboardActivitySchema.fields;

/** A roster person with their serving activity. */
export const peopleDashboardPersonSchema = Schema.Struct({
  ...peopleDashboardRosterPersonSchema.fields,
  ...activityFields,
});

export const peopleDashboardTeamSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The team's service type, to tell same-named teams apart. */
  serviceTypeName: Schema.NullOr(Schema.String),
  personIds: mutableArray(Schema.String),
});

export const peopleDashboardRosterSchema = Schema.Struct({
  generatedAt: Schema.String,
  month: peopleDashboardMonthSchema,
  /** Sorted by last name, then first name. */
  people: mutableArray(peopleDashboardRosterPersonSchema),
  teams: mutableArray(peopleDashboardTeamSchema),
  /** Teams the signed-in person leads; empty when they lead none or are unknown. */
  ledTeamIds: mutableArray(Schema.String),
});

export const peopleDashboardActivityBatchSchema = Schema.Struct({
  generatedAt: Schema.String,
  people: mutableArray(peopleDashboardActivitySchema),
  /**
   * Requested people this call left for a follow-up call to stay within its
   * Planning Center request budget. Empty when the batch is complete.
   */
  deferredPersonIds: mutableArray(Schema.String),
  requestBudget: Schema.Struct({
    limit: finiteNumber,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: finiteNumber,
    scheduleRequests: finiteNumber,
    planTimeRequests: finiteNumber,
  }),
});

export const peopleDashboardPersonDetailSchema = Schema.Struct({
  generatedAt: Schema.String,
  month: peopleDashboardMonthSchema,
  previousMonth: Schema.String,
  nextMonth: Schema.String,
  /**
   * The rhythm reads the same schedules the dashboard does; `teams` are the teams the person
   * served on lately, and `monthDays` cover the requested month.
   */
  person: peopleDashboardPersonSchema,
  requestBudget: Schema.Struct({
    limit: finiteNumber,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: finiteNumber,
    /**
     * Rehearsal (and other) times the budget left unread; their assignments show on their
     * plan's date. Zero when the detail is complete.
     */
    unresolvedRehearsalTimes: finiteNumber,
  }),
});

export const peopleSearchResultSchema = Schema.Struct({
  id: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  fullName: Schema.String,
  photoThumbnailUrl: Schema.NullOr(Schema.String),
});

export const myScheduledPlansDataSchema = Schema.Struct({
  planIds: mutableArray(Schema.String),
});
