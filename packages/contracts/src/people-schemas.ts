import { teamPositionSchema } from "@worship-admin/contracts/catalog";
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

export const peopleDashboardRangeSchema = z.enum(["month", "30", "90"]);

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

export const peopleDashboardPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  photoThumbnailUrl: z.string().nullable(),
  teams: z.array(z.string()),
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

export const peopleDashboardStatsSchema = z.object({
  scheduledPeople: z.number(),
  highLoadPeople: z.number(),
  availableSoonPeople: z.number(),
});

export const peopleDashboardDaySchema = z.object({
  day: z.number(),
  serviceCount: z.number(),
  confirmedServiceCount: z.number(),
  potentialServiceCount: z.number(),
  rehearsalCount: z.number(),
  blockoutCount: z.number(),
});

export const peopleDashboardRequestBudgetSchema = z.object({
  teamRequests: z.number(),
  scheduleRequests: z.number(),
  blockoutRequests: z.number(),
  rosterPeopleCount: z.number(),
  hydratedPeopleCount: z.number(),
  sampled: z.boolean(),
});

export const peopleDashboardDataSchema = z.object({
  range: peopleDashboardRangeSchema,
  generatedAt: z.string(),
  month: z.object({
    year: z.number(),
    monthIndex: z.number(),
    label: z.string(),
    daysInMonth: z.number(),
    startsOnWeekday: z.number(),
  }),
  people: z.array(peopleDashboardPersonSchema),
  stats: peopleDashboardStatsSchema,
  monthDays: z.array(peopleDashboardDaySchema),
  matrixDays: z.array(z.number()),
  requestBudget: peopleDashboardRequestBudgetSchema,
});

export const peopleDashboardPersonDetailSchema = z.object({
  generatedAt: z.string(),
  month: z.object({
    year: z.number(),
    monthIndex: z.number(),
    label: z.string(),
    daysInMonth: z.number(),
    startsOnWeekday: z.number(),
  }),
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
export type PeopleDashboardRange = z.output<typeof peopleDashboardRangeSchema>;
export type PeopleDashboardLoad = z.output<typeof peopleDashboardLoadSchema>;
export type PeopleDashboardDayKind = z.output<
  typeof peopleDashboardDayKindSchema
>;
export type PeopleDashboardPerson = z.output<
  typeof peopleDashboardPersonSchema
>;
export type PeopleDashboardStats = z.output<typeof peopleDashboardStatsSchema>;
export type PeopleDashboardDay = z.output<typeof peopleDashboardDaySchema>;
export type PeopleDashboardRequestBudget = z.output<
  typeof peopleDashboardRequestBudgetSchema
>;
export type PeopleDashboardData = z.output<typeof peopleDashboardDataSchema>;
export type PeopleDashboardPersonDetail = z.output<
  typeof peopleDashboardPersonDetailSchema
>;
export type PeopleSearchResult = z.output<typeof peopleSearchResultSchema>;
export type MyScheduledPlansData = z.output<typeof myScheduledPlansDataSchema>;
