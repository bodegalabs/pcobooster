import { z } from "zod";

import type { MyScheduledPlansData } from "@/lib/my-scheduled-plans-cache";
import type {
  SerializedPlanItemSong,
  SerializedPlanItemArrangement,
  SerializedPlanItem,
} from "@/lib/plan-item-client";
import type { SerializedPlanTime } from "@/lib/plan-time-client";
import type {
  SerializedSongCatalogEntry,
  SerializedSongOptionSet,
} from "@/lib/song-catalog-client";
import type {
  ServiceType,
  Plan,
  Blockout,
  ScheduleFrequency,
  ServiceHistoryItem,
  FilledPositionPerson,
  TeamPosition,
  PersonWithAvailability,
  TeamPositionGroup,
  PlanPerson,
  PlanItemType,
  PlanItemServicePosition,
  PlanItemKey,
  LayoutOption,
  PlanTimeType,
  KeyOption,
  ArrangementOption,
} from "@/lib/types";
import type {
  PeopleDashboardRange,
  PeopleDashboardLoad,
  PeopleDashboardDayKind,
  PeopleDashboardPerson,
  PeopleDashboardStats,
  PeopleDashboardDay,
  PeopleDashboardRequestBudget,
  PeopleDashboardData,
  PeopleDashboardPersonDetail,
} from "@/lib/use-cases/planning-center/people-dashboard-types";
import type { PeopleSearchResult } from "@/lib/use-cases/planning-center/search-people";

// Validate response data before it enters the query cache. Date schemas also
// restore dates serialized by Next.js route handlers.
const serializedDateSchema = z.union([z.string(), z.date()]);
const responseDateSchema = serializedDateSchema.pipe(z.coerce.date());
export const serviceTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence: z.number(),
}) satisfies z.ZodType<ServiceType>;

export const planSchema = z.object({
  id: z.string(),
  title: z.string(),
  seriesTitle: z.string().optional(),
  seriesId: z.string().nullable().optional(),
  planningCenterUrl: z.string().nullable().optional(),
  createdAt: responseDateSchema,
  sortDate: responseDateSchema.optional(),
}) satisfies z.ZodType<Plan>;

export const blockoutSchema = z.object({
  id: z.string(),
  reason: z.string(),
  startsAt: responseDateSchema,
  endsAt: responseDateSchema,
  description: z.string(),
  share: z.boolean(),
  timeZone: z.string().nullable().optional(),
}) satisfies z.ZodType<Blockout>;

export const scheduleFrequencySchema = z.object({
  recentServedDays: z.number(),
  last60Days: z.number(),
  last90Days: z.number(),
  lastServedDate: responseDateSchema.optional(),
  totalServed: z.number(),
  recentRehearsalOnlyDays: z.number(),
  rehearsalLast60Days: z.number(),
  rehearsalLast90Days: z.number(),
  lastRehearsalDate: responseDateSchema.optional(),
  totalRehearsals: z.number(),
  upcomingServices: z.number(),
  nextUpcomingDate: responseDateSchema.optional(),
  upcomingRehearsals: z.number(),
  nextRehearsalDate: responseDateSchema.optional(),
}) satisfies z.ZodType<ScheduleFrequency>;

export const serviceHistoryItemSchema = z.object({
  id: z.string(),
  sourceScheduleId: z.string(),
  date: responseDateSchema,
  teamPositionName: z.string(),
  teamName: z.string().optional(),
  serviceTypeName: z.string().optional(),
  planTitle: z.string().optional(),
  status: z.string(),
  timeType: z.enum(["service", "rehearsal", "other"]).optional(),
}) satisfies z.ZodType<ServiceHistoryItem>;

export const filledPositionPersonSchema = z.object({
  id: z.string(),
  planPersonId: z.string(),
  personId: z.string().nullable().optional(),
  name: z.string(),
  status: z.enum(["pending", "confirmed"]),
  rawStatus: z.string(),
  photoThumbnailUrl: z.string().nullable().optional(),
  assignedTimeIds: z.array(z.string()).optional(),
  serviceTimeIds: z.array(z.string()).optional(),
}) satisfies z.ZodType<FilledPositionPerson>;

export const teamPositionSchema = z.object({
  id: z.string(),
  name: z.string(),
  teamId: z.string(),
  teamName: z.string().optional(),
  source: z
    .enum(["team_position", "needed_position", "plan_member", "custom"])
    .optional(),
  neededPositionId: z.string().optional(),
  timeId: z.string().nullable().optional(),
  timePreferenceOptionId: z.string().nullable().optional(),
  neededCount: z.number().optional(),
  filledPendingCount: z.number().optional(),
  filledConfirmedCount: z.number().optional(),
  filledPeople: z.array(filledPositionPersonSchema).optional(),
}) satisfies z.ZodType<TeamPosition>;

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
}) satisfies z.ZodType<PersonWithAvailability>;

export const teamPositionGroupSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  positions: z.array(teamPositionSchema),
}) satisfies z.ZodType<TeamPositionGroup>;

export const planPersonSchema = z.object({
  id: z.string(),
  status: z.string(),
  createdAt: responseDateSchema,
  teamPositionName: z.string(),
  planTitle: z.string().optional(),
  planDate: responseDateSchema.optional(),
  declineReason: z.string().optional(),
}) satisfies z.ZodType<PlanPerson>;

export const serializedPlanItemSongSchema = z.object({
  lastScheduledAt: serializedDateSchema.nullable(),
  id: z.string(),
  title: z.string(),
  author: z.string(),
  themes: z.string(),
}) satisfies z.ZodType<SerializedPlanItemSong>;

export const serializedPlanItemArrangementSchema = z.object({
  archivedAt: serializedDateSchema.nullable(),
  id: z.string(),
  sequence: z.array(z.string()),
  length: z.number().nullable(),
  name: z.string(),
}) satisfies z.ZodType<SerializedPlanItemArrangement>;

export const planItemTypeSchema = z.enum([
  "song",
  "header",
  "item",
  "media",
]) satisfies z.ZodType<PlanItemType>;

export const planItemServicePositionSchema = z.enum([
  "pre",
  "during",
  "post",
]) satisfies z.ZodType<PlanItemServicePosition>;

export const planItemKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  startingKey: z.string().nullable(),
  endingKey: z.string().nullable(),
}) satisfies z.ZodType<PlanItemKey>;

export const layoutOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
}) satisfies z.ZodType<LayoutOption>;

export const serializedPlanItemSchema = z.object({
  song: serializedPlanItemSongSchema.nullable(),
  arrangement: serializedPlanItemArrangementSchema.nullable(),
  id: z.string(),
  title: z.string(),
  itemType: planItemTypeSchema,
  sequence: z.number(),
  servicePosition: planItemServicePositionSchema,
  length: z.number().nullable(),
  description: z.string(),
  htmlDetails: z.string(),
  customArrangementSequence: z.array(z.string()),
  key: planItemKeySchema.nullable(),
  layout: layoutOptionSchema.nullable(),
}) satisfies z.ZodType<SerializedPlanItem>;

export const planTimeTypeSchema = z.enum([
  "service",
  "rehearsal",
  "other",
]) satisfies z.ZodType<PlanTimeType>;

export const serializedPlanTimeSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  timeType: planTimeTypeSchema,
  teamReminders: z.json(),
  assignedTeamIds: z.array(z.string()),
  assignedPositionIds: z.array(z.string()),
  splitTeamRehearsalAssignmentIds: z.array(z.string()),
}) satisfies z.ZodType<SerializedPlanTime>;

export const serializedSongCatalogEntrySchema = z.object({
  lastScheduledAt: serializedDateSchema.nullable(),
  id: z.string(),
  title: z.string(),
  author: z.string(),
  themes: z.string(),
  hidden: z.boolean(),
  matchScore: z.number().optional(),
}) satisfies z.ZodType<SerializedSongCatalogEntry>;

export const keyOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  startingKey: z.string().nullable(),
  endingKey: z.string().nullable(),
}) satisfies z.ZodType<KeyOption>;

export const arrangementOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  sequence: z.array(z.string()),
  length: z.number().nullable(),
  archived: z.boolean(),
  keys: z.array(keyOptionSchema),
}) satisfies z.ZodType<ArrangementOption>;

export const serializedSongOptionSetSchema = z.object({
  song: serializedSongCatalogEntrySchema,
  arrangements: z.array(arrangementOptionSchema),
  layouts: z.array(layoutOptionSchema),
  currentLayout: layoutOptionSchema.nullable(),
  suggestedArrangementId: z.string().nullable(),
  suggestedKeyId: z.string().nullable(),
  suggestedLayoutId: z.string().nullable(),
  layoutMode: z.enum(["unavailable", "existing-only", "editable"]),
}) satisfies z.ZodType<SerializedSongOptionSet>;

export const peopleDashboardRangeSchema = z.enum([
  "month",
  "30",
  "90",
]) satisfies z.ZodType<PeopleDashboardRange>;

export const peopleDashboardLoadSchema = z.enum([
  "low",
  "high",
  "normal",
  "rest",
]) satisfies z.ZodType<PeopleDashboardLoad>;

export const peopleDashboardDayKindSchema = z.enum([
  "service",
  "rehearsal",
  "rest",
  "blockout",
]) satisfies z.ZodType<PeopleDashboardDayKind>;

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
}) satisfies z.ZodType<PeopleDashboardPerson>;

export const peopleDashboardStatsSchema = z.object({
  scheduledPeople: z.number(),
  highLoadPeople: z.number(),
  availableSoonPeople: z.number(),
}) satisfies z.ZodType<PeopleDashboardStats>;

export const peopleDashboardDaySchema = z.object({
  day: z.number(),
  serviceCount: z.number(),
  confirmedServiceCount: z.number(),
  potentialServiceCount: z.number(),
  rehearsalCount: z.number(),
  blockoutCount: z.number(),
}) satisfies z.ZodType<PeopleDashboardDay>;

export const peopleDashboardRequestBudgetSchema = z.object({
  teamRequests: z.number(),
  scheduleRequests: z.number(),
  blockoutRequests: z.number(),
  rosterPeopleCount: z.number(),
  hydratedPeopleCount: z.number(),
  sampled: z.boolean(),
}) satisfies z.ZodType<PeopleDashboardRequestBudget>;

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
}) satisfies z.ZodType<PeopleDashboardData>;

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
}) satisfies z.ZodType<PeopleDashboardPersonDetail>;

export const peopleSearchResultSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  photoThumbnailUrl: z.string().nullable(),
}) satisfies z.ZodType<PeopleSearchResult>;

export const myScheduledPlansDataSchema = z.object({
  planIds: z.array(z.string()),
}) satisfies z.ZodType<MyScheduledPlansData>;

export const successResponseSchema = z.object({ success: z.boolean() });
export const scheduleResponseSchema = successResponseSchema.extend({
  data: z.object({ id: z.string().optional() }).optional(),
});
export const scheduleHistoryResponseSchema = z.object({
  planPeople: z.array(planPersonSchema),
  frequency: scheduleFrequencySchema,
});
export const organizationTimeZoneSchema = z.object({ timeZone: z.string() });
