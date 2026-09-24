import { teamPositionSchema } from "@pcobooster/contracts/catalog";
import { z } from "zod";

export const blockoutSchema = z.object({
  id: z.string(),
  reason: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  description: z.string(),
  share: z.boolean(),
  timeZone: z.string().nullable().optional(),
});

export const scheduleFrequencySchema = z.object({
  recentServedDays: z.number(),
  last60Days: z.number(),
  last90Days: z.number(),
  lastServedDate: z.date().optional(),
  totalServed: z.number(),
  recentRehearsalOnlyDays: z.number(),
  rehearsalLast60Days: z.number(),
  rehearsalLast90Days: z.number(),
  lastRehearsalDate: z.date().optional(),
  totalRehearsals: z.number(),
  upcomingServices: z.number(),
  nextUpcomingDate: z.date().optional(),
  upcomingRehearsals: z.number(),
  nextRehearsalDate: z.date().optional(),
});

export const serviceHistoryItemSchema = z.object({
  id: z.string(),
  sourceScheduleId: z.string(),
  date: z.date(),
  teamPositionName: z.string(),
  teamName: z.string().optional(),
  serviceTypeName: z.string().optional(),
  planTitle: z.string().optional(),
  status: z.string(),
  timeType: z.enum(["service", "rehearsal", "other"]).optional(),
});

export const personWithAvailabilitySchema = z.object({
  availability: z.enum(["available", "blocked", "unknown"]).optional(),
  frequency: scheduleFrequencySchema.optional(),
  blockouts: z.array(blockoutSchema).optional(),
  serviceHistory: z.array(serviceHistoryItemSchema).optional(),
  isBlockedForDate: z.boolean().optional(),
  isScheduledForSelectedPlanPosition: z.boolean().optional(),
  isConfirmedForSelectedPlanPosition: z.boolean().optional(),
  isDeclinedForSelectedPlanPosition: z.boolean().optional(),
  selectedPlanDeclineReason: z.string().nullable().optional(),
  selectedPlanAssignmentLabels: z.array(z.string()).optional(),
  scheduledPlanPersonId: z.string().optional(),
  recommendationScore: z.number().optional(),
  recommendationReasoning: z.array(z.string()).optional(),
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  photoUrl: z.string().nullable(),
  photoThumbnailUrl: z.string().nullable(),
  archived: z.boolean(),
  positions: z.array(teamPositionSchema),
});

export const planPersonSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: z.date(),
  teamPositionName: z.string(),
  planTitle: z.string().optional(),
  planDate: z.date().optional(),
  declineReason: z.string().optional(),
});

export const peopleDashboardLoadSchema = z.enum([
  "low",
  "high",
  "normal",
  "rest",
]);

export const peopleDashboardDayKindSchema = z.enum([
  "service",
  "rehearsal",
  "rest",
  "blockout",
]);

export const peopleDashboardMonthSchema = z.object({
  year: z.number(),
  monthIndex: z.number(),
  label: z.string(),
  daysInMonth: z.number(),
  startsOnWeekday: z.number(),
});

/** Who is on the roster: identity and teams, with no schedule reads behind it. */
export const peopleDashboardRosterPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  photoThumbnailUrl: z.string().nullable(),
  teams: z.array(z.string()),
});

/** How one roster person is serving, derived from their own schedules. */
export const peopleDashboardActivitySchema = z.object({
  id: z.string(),
  roles: z.string(),
  status: z.string(),
  load: peopleDashboardLoadSchema,
  lastServed: z.string(),
  lastRehearsal: z.string().optional(),
  nextScheduled: z.string(),
  nextRehearsal: z.string().optional(),
  monthCount: z.number(),
  thirtyDayCount: z.number(),
  ninetyDayCount: z.number(),
  upcomingCount: z.number(),
  streak: z.string(),
  highlight: z.string(),
  monthDays: z.array(
    z.object({
      day: z.number(),
      kind: peopleDashboardDayKindSchema,
      positionName: z.string().optional(),
      serviceTypeName: z.string().optional(),
      status: z.string().optional(),
      planUrl: z.string().optional(),
    })
  ),
});

export const peopleDashboardPersonSchema =
  peopleDashboardRosterPersonSchema.extend(
    peopleDashboardActivitySchema.omit({ id: true }).shape
  );

export const peopleDashboardRosterSchema = z.object({
  generatedAt: z.string(),
  month: peopleDashboardMonthSchema,
  /** Sorted by last name, then first name. */
  people: z.array(peopleDashboardRosterPersonSchema),
});

export const peopleDashboardActivityBatchSchema = z.object({
  generatedAt: z.string(),
  people: z.array(peopleDashboardActivitySchema),
  /**
   * Requested people this call left for a follow-up call to stay within its
   * Planning Center request budget. Empty when the batch is complete.
   */
  deferredPersonIds: z.array(z.string()),
  requestBudget: z.object({
    limit: z.number(),
    /** Upper bound: a cached read is counted as if it reached Planning Center. */
    planningCenterRequests: z.number(),
    scheduleRequests: z.number(),
    planTimeRequests: z.number(),
  }),
});

export const peopleDashboardPersonDetailSchema = z.object({
  generatedAt: z.string(),
  month: peopleDashboardMonthSchema,
  previousMonth: z.string(),
  nextMonth: z.string(),
  person: peopleDashboardPersonSchema,
  trend: z.array(
    z.object({
      month: z.string(),
      label: z.string(),
      services: z.number(),
      rehearsals: z.number(),
    })
  ),
  requestBudget: z.object({
    scheduleRequests: z.number(),
    blockoutRequests: z.number(),
  }),
});

export const peopleSearchResultSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  photoThumbnailUrl: z.string().nullable(),
});

export const myScheduledPlansDataSchema = z.object({
  planIds: z.array(z.string()),
});

export const scheduleHistoryResponseSchema = z.object({
  planPeople: z.array(planPersonSchema),
  frequency: scheduleFrequencySchema,
});

export type Blockout = z.output<typeof blockoutSchema>;
export type ScheduleFrequency = z.output<typeof scheduleFrequencySchema>;
export type ServiceHistoryItem = z.output<typeof serviceHistoryItemSchema>;
export type PersonWithAvailability = z.output<
  typeof personWithAvailabilitySchema
>;
export type PlanPerson = z.output<typeof planPersonSchema>;
export type PeopleDashboardLoad = z.output<typeof peopleDashboardLoadSchema>;
export type PeopleDashboardDayKind = z.output<
  typeof peopleDashboardDayKindSchema
>;
export type PeopleDashboardMonth = z.output<typeof peopleDashboardMonthSchema>;
export type PeopleDashboardRosterPerson = z.output<
  typeof peopleDashboardRosterPersonSchema
>;
export type PeopleDashboardActivity = z.output<
  typeof peopleDashboardActivitySchema
>;
export type PeopleDashboardPerson = z.output<
  typeof peopleDashboardPersonSchema
>;
export type PeopleDashboardRoster = z.output<
  typeof peopleDashboardRosterSchema
>;
export type PeopleDashboardActivityBatch = z.output<
  typeof peopleDashboardActivityBatchSchema
>;
export type PeopleDashboardPersonDetail = z.output<
  typeof peopleDashboardPersonDetailSchema
>;
export type PeopleSearchResult = z.output<typeof peopleSearchResultSchema>;
export type MyScheduledPlansData = z.output<typeof myScheduledPlansDataSchema>;
