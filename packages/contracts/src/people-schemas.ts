import { Schema, Struct } from "effect";

export const blockoutSchema = Schema.Struct({
  id: Schema.String,
  reason: Schema.String,
  startsAt: Schema.Date,
  endsAt: Schema.Date,
  description: Schema.String,
  share: Schema.Boolean,
  timeZone: Schema.optional(Schema.NullOr(Schema.String)),
}).mapFields(Struct.map(Schema.mutableKey));

export const scheduleFrequencySchema = Schema.Struct({
  recentServedDays: Schema.Finite,
  last60Days: Schema.Finite,
  last90Days: Schema.Finite,
  lastServedDate: Schema.optional(Schema.Date),
  totalServed: Schema.Finite,
  recentRehearsalOnlyDays: Schema.Finite,
  rehearsalLast60Days: Schema.Finite,
  rehearsalLast90Days: Schema.Finite,
  lastRehearsalDate: Schema.optional(Schema.Date),
  totalRehearsals: Schema.Finite,
  upcomingServices: Schema.Finite,
  nextUpcomingDate: Schema.optional(Schema.Date),
  upcomingRehearsals: Schema.Finite,
  nextRehearsalDate: Schema.optional(Schema.Date),
}).mapFields(Struct.map(Schema.mutableKey));

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
}).mapFields(Struct.map(Schema.mutableKey));

/** A person's Planning Center scheduling preferences for the position. */
export const schedulingPreferencesSchema = Schema.Struct({
  schedulePreference: Schema.NullOr(Schema.String),
  preferredWeeks: Schema.mutable(
    Schema.Array(Schema.Finite.check(Schema.isInt()))
  ),
  timePreferenceOptionIds: Schema.mutable(Schema.Array(Schema.String)),
  maxPlansPerDay: Schema.NullOr(Schema.Finite.check(Schema.isInt())),
  maxPlansPerMonth: Schema.NullOr(Schema.Finite.check(Schema.isInt())),
}).mapFields(Struct.map(Schema.mutableKey));

/** The selected plan and slot candidates are matched against. */
export const selectedPlanMatchSchema = Schema.Struct({
  planId: Schema.optional(Schema.String),
  teamId: Schema.optional(Schema.String),
  selectedPositionName: Schema.optional(Schema.String),
  selectedTeamName: Schema.optional(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const selectedPlanSlotSchema = Schema.Struct({
  planPersonId: Schema.String,
  status: Schema.Literals(["confirmed", "pending", "declined"]),
  declineReason: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

/** A candidate with the selected plan's fresh roster applied; no history or availability. */
export const positionCandidateSchema = Schema.Struct({
  id: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  fullName: Schema.String,
  photoUrl: Schema.NullOr(Schema.String),
  photoThumbnailUrl: Schema.NullOr(Schema.String),
  archived: Schema.Boolean,
  selectedPlanRosterLabels: Schema.mutable(Schema.Array(Schema.String)),
  selectedPlanSlot: Schema.NullOr(selectedPlanSlotSchema),
  /** Null for people on the selected slot who are not assigned to the position. */
  schedulingPreferences: Schema.NullOr(schedulingPreferencesSchema),
}).mapFields(Struct.map(Schema.mutableKey));

export const positionCandidatesSchema = Schema.Struct({
  generatedAt: Schema.String,
  timeZone: Schema.String,
  match: selectedPlanMatchSchema,
  candidates: Schema.mutable(Schema.Array(positionCandidateSchema)),
}).mapFields(Struct.map(Schema.mutableKey));

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
}).mapFields(Struct.map(Schema.mutableKey));

export const candidateHistorySchema = Schema.Struct({
  /** Unsorted; the browser sorts, summarizes, and trims them. */
  serviceHistory: Schema.mutable(Schema.Array(serviceHistoryItemSchema)),
  selectedPlanAssignments: Schema.mutable(
    Schema.Array(selectedPlanAssignmentSchema)
  ),
}).mapFields(Struct.map(Schema.mutableKey));

export const windowPlanRefSchema = Schema.Struct({
  serviceTypeId: Schema.Trim.check(Schema.isMinLength(1)),
  planId: Schema.Trim.check(Schema.isMinLength(1)),
  /** Roster pages the plan needs; a follow-up call reserves them before locating plans. */
  rosterRequests: Schema.Finite.check(Schema.isInt())
    .check(Schema.isGreaterThanOrEqualTo(0))
    .check(Schema.isLessThanOrEqualTo(100)),
}).mapFields(Struct.map(Schema.mutableKey));

export const windowPlanSummarySchema = Schema.Struct({
  id: Schema.String,
  title: Schema.NullOr(Schema.String),
  sortDate: Schema.NullOr(Schema.String),
  serviceTypeName: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const windowPlanTimeSchema = Schema.Struct({
  id: Schema.String,
  startsAt: Schema.NullOr(Schema.String),
  timeType: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const windowRosterRowSchema = Schema.Struct({
  id: Schema.String,
  planId: Schema.NullOr(Schema.String),
  teamId: Schema.NullOr(Schema.String),
  teamPositionName: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  timeIds: Schema.mutable(Schema.Array(Schema.String)),
  serviceTimeIds: Schema.mutable(Schema.Array(Schema.String)),
  declineReason: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const planWindowHistoryBatchSchema = Schema.Struct({
  generatedAt: Schema.String,
  /** Rosters read by this call, including plans with no one scheduled. */
  loadedPlanCount: Schema.Finite,
  /** Plans and times the rows point at; the browser expands rows into history items. */
  plans: Schema.mutable(Schema.Array(windowPlanSummarySchema)),
  planTimes: Schema.mutable(Schema.Array(windowPlanTimeSchema)),
  people: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        personId: Schema.String,
        rows: Schema.mutable(Schema.Array(windowRosterRowSchema)),
      }).mapFields(Struct.map(Schema.mutableKey))
    )
  ),
  /** Listed plans left for a follow-up call, in window order. */
  deferredPlans: Schema.mutable(Schema.Array(windowPlanRefSchema)),
  /** Service types not listed yet; their plans follow `deferredPlans`. */
  deferredServiceTypeIds: Schema.mutable(Schema.Array(Schema.String)),
  requestBudget: Schema.Struct({
    limit: Schema.Finite,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: Schema.Finite,
    planRangeRequests: Schema.Finite,
    rosterRequests: Schema.Finite,
  }).mapFields(Struct.map(Schema.mutableKey)),
}).mapFields(Struct.map(Schema.mutableKey));

export const candidateDetailSchema = Schema.Struct({
  personId: Schema.String,
  isBlockedForDate: Schema.Boolean,
  /** The person's own schedule history, only when it was asked for. */
  history: Schema.optional(candidateHistorySchema),
}).mapFields(Struct.map(Schema.mutableKey));

/** Blockout checks a previous call already did for a person it left unfinished. */
export const blockoutProgressSchema = Schema.Struct({
  personId: Schema.Trim.check(Schema.isMinLength(1)),
  /** Repeating blockouts read and found not to cover the plan day. */
  checkedBlockoutIds: Schema.mutable(
    Schema.Array(Schema.Trim.check(Schema.isMinLength(1)))
  ).check(Schema.isMaxLength(1000)),
  /** A blockout was found to cover the plan day. */
  blocked: Schema.Boolean,
}).mapFields(Struct.map(Schema.mutableKey));

export const candidateDetailsBatchSchema = Schema.Struct({
  generatedAt: Schema.String,
  people: Schema.mutable(Schema.Array(candidateDetailSchema)),
  /** Requested people left for a follow-up call to stay within the budget. */
  deferredPersonIds: Schema.mutable(Schema.Array(Schema.String)),
  /** Pass back with `deferredPersonIds`; the next call skips checks already done. */
  blockoutProgress: Schema.mutable(Schema.Array(blockoutProgressSchema)),
  requestBudget: Schema.Struct({
    limit: Schema.Finite,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: Schema.Finite,
    /** Blockout lists and schedule pages. */
    firstReadRequests: Schema.Finite,
    blockoutDateRequests: Schema.Finite,
    planTimeRequests: Schema.Finite,
  }).mapFields(Struct.map(Schema.mutableKey)),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleDashboardDayKindSchema = Schema.Literals([
  "service",
  "rehearsal",
]);

export const peopleDashboardMonthSchema = Schema.Struct({
  year: Schema.Finite,
  monthIndex: Schema.Finite,
  label: Schema.String,
  daysInMonth: Schema.Finite,
  startsOnWeekday: Schema.Finite,
}).mapFields(Struct.map(Schema.mutableKey));

/** Who is on the roster: identity and teams, with no schedule reads behind it. */
export const peopleDashboardRosterPersonSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  initials: Schema.String,
  photoThumbnailUrl: Schema.NullOr(Schema.String),
  teams: Schema.mutable(Schema.Array(Schema.String)),
}).mapFields(Struct.map(Schema.mutableKey));

const calendarDayKeySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)
);

/** How a person has been serving and responding; days are org `YYYY-MM-DD`. */
export const servingRhythmSchema = Schema.Struct({
  lastServedOn: Schema.NullOr(calendarDayKeySchema),
  nextServingOn: Schema.NullOr(calendarDayKeySchema),
  servedDays30: Schema.Finite,
  servedDays90: Schema.Finite,
  servedDays180: Schema.Finite,
  upcomingDays30: Schema.Finite,
  /** Median days between served days in the last 180; null with too few. */
  typicalGapDays: Schema.NullOr(Schema.Finite),
  /** Schedules dated in the last 180 days through today, declined included. */
  requests180: Schema.Finite,
  declined180: Schema.Finite,
  /** Upcoming schedules still unconfirmed. */
  pendingUpcoming: Schema.Finite,
  nextPendingOn: Schema.NullOr(calendarDayKeySchema),
}).mapFields(Struct.map(Schema.mutableKey));

/** A service or rehearsal day in a person's month, one per position, service type, and status. */
export const peopleDashboardMonthDaySchema = Schema.Struct({
  day: Schema.Finite,
  kind: peopleDashboardDayKindSchema,
  positionName: Schema.optional(Schema.String),
  serviceTypeName: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  planUrl: Schema.optional(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

/** How one roster person is serving, derived from their own schedules. */
export const peopleDashboardActivitySchema = Schema.Struct({
  id: Schema.String,
  rhythm: servingRhythmSchema,
  /** Their most common positions, most common first; empty without schedules. */
  roles: Schema.mutable(Schema.Array(Schema.String)),
  /** The month's services and rehearsals, by day. */
  monthDays: Schema.mutable(Schema.Array(peopleDashboardMonthDaySchema)),
}).mapFields(Struct.map(Schema.mutableKey));

/** A roster person with their serving activity. */
export const peopleDashboardPersonSchema = Schema.Struct({
  ...peopleDashboardRosterPersonSchema.fields,
  ...peopleDashboardActivitySchema.mapFields(Struct.omit(["id"])).fields,
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleDashboardTeamSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The team's service type, to tell same-named teams apart. */
  serviceTypeName: Schema.NullOr(Schema.String),
  personIds: Schema.mutable(Schema.Array(Schema.String)),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleDashboardRosterSchema = Schema.Struct({
  generatedAt: Schema.String,
  month: peopleDashboardMonthSchema,
  /** Sorted by last name, then first name. */
  people: Schema.mutable(Schema.Array(peopleDashboardRosterPersonSchema)),
  teams: Schema.mutable(Schema.Array(peopleDashboardTeamSchema)),
  /** Teams the signed-in person leads; empty when they lead none or are unknown. */
  ledTeamIds: Schema.mutable(Schema.Array(Schema.String)),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleDashboardActivityBatchSchema = Schema.Struct({
  generatedAt: Schema.String,
  people: Schema.mutable(Schema.Array(peopleDashboardActivitySchema)),
  /**
   * Requested people this call left for a follow-up call to stay within its
   * Planning Center request budget. Empty when the batch is complete.
   */
  deferredPersonIds: Schema.mutable(Schema.Array(Schema.String)),
  requestBudget: Schema.Struct({
    limit: Schema.Finite,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: Schema.Finite,
    scheduleRequests: Schema.Finite,
    planTimeRequests: Schema.Finite,
  }).mapFields(Struct.map(Schema.mutableKey)),
}).mapFields(Struct.map(Schema.mutableKey));

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
    limit: Schema.Finite,
    /** Planning Center requests the call sent; cached reads cost none. */
    planningCenterRequests: Schema.Finite,
    /**
     * Rehearsal (and other) times the budget left unread; their assignments show on their
     * plan's date. Zero when the detail is complete.
     */
    unresolvedRehearsalTimes: Schema.Finite,
  }).mapFields(Struct.map(Schema.mutableKey)),
}).mapFields(Struct.map(Schema.mutableKey));

export const peopleSearchResultSchema = Schema.Struct({
  id: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  fullName: Schema.String,
  photoThumbnailUrl: Schema.NullOr(Schema.String),
}).mapFields(Struct.map(Schema.mutableKey));

export const myScheduledPlansDataSchema = Schema.Struct({
  planIds: Schema.mutable(Schema.Array(Schema.String)),
}).mapFields(Struct.map(Schema.mutableKey));

export type Blockout = typeof blockoutSchema.Type;

export type ScheduleFrequency = typeof scheduleFrequencySchema.Type;

export type ServiceHistoryItem = typeof serviceHistoryItemSchema.Type;

export type PositionCandidates = typeof positionCandidatesSchema.Type;

export type PlanWindowHistoryBatch = typeof planWindowHistoryBatchSchema.Type;

export type CandidateDetailsBatch = typeof candidateDetailsBatchSchema.Type;

export type PeopleDashboardDayKind = typeof peopleDashboardDayKindSchema.Type;

export type PeopleDashboardMonth = typeof peopleDashboardMonthSchema.Type;

export type PeopleDashboardMonthDay = typeof peopleDashboardMonthDaySchema.Type;

export type PeopleDashboardRosterPerson =
  typeof peopleDashboardRosterPersonSchema.Type;

export type ServingRhythm = typeof servingRhythmSchema.Type;

export type PeopleDashboardTeam = typeof peopleDashboardTeamSchema.Type;

export type PeopleDashboardActivity = typeof peopleDashboardActivitySchema.Type;

export type PeopleDashboardPerson = typeof peopleDashboardPersonSchema.Type;

export type PeopleDashboardRoster = typeof peopleDashboardRosterSchema.Type;

export type PeopleDashboardActivityBatch =
  typeof peopleDashboardActivityBatchSchema.Type;

export type PeopleDashboardPersonDetail =
  typeof peopleDashboardPersonDetailSchema.Type;

export type PeopleSearchResult = typeof peopleSearchResultSchema.Type;

export type MyScheduledPlansData = typeof myScheduledPlansDataSchema.Type;
